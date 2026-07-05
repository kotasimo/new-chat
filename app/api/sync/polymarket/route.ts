import { NextResponse } from "next/server";
import {
  buildAppMarketRecordsFromEvents,
  fetchPolymarketWorldCupEvents,
} from "@/lib/polymarket";
import { createServerSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return syncPolymarket(request, "cron");
}

export async function POST(request: Request) {
  return syncPolymarket(request, "manual");
}

async function syncPolymarket(request: Request, mode: "cron" | "manual") {
  const syncSecret = mode === "cron"
    ? process.env.CRON_SECRET ?? process.env.SYNC_SECRET
    : process.env.SYNC_SECRET;
  const authorization = request.headers.get("authorization");

  if (syncSecret && authorization !== `Bearer ${syncSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasSupabaseConfig() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error:
          "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 503 },
    );
  }

  try {
    const supabase = createServerSupabaseClient({ admin: true });
    const gammaEvents = await fetchPolymarketWorldCupEvents(500);
    const syncedAt = new Date().toISOString();
    const apiRecords = buildAppMarketRecordsFromEvents(gammaEvents);

  const records = apiRecords.map((record) => ({
    market: { ...record.market, synced_at: syncedAt },
    outcomes: record.outcomes,
  }));
  const existingOutcomeProbabilityById = await getExistingOutcomeProbabilities(
    supabase,
    records.flatMap((record) => record.outcomes.map((outcome) => outcome.id)),
  );
  const syncedAtMs = new Date(syncedAt).getTime();
  const recordsForUpsert = records.map((record) => {
    const lockAtMs = record.market.lock_at
      ? new Date(record.market.lock_at).getTime()
      : Number.NaN;
    const shouldFreezeProbability = record.market.closed ||
      (Number.isFinite(lockAtMs) && lockAtMs <= syncedAtMs);

    return {
      market: record.market,
      outcomes: record.outcomes.map((outcome) => ({
        ...outcome,
        probability: shouldFreezeProbability
          ? existingOutcomeProbabilityById.get(outcome.id) ?? outcome.probability
          : outcome.probability,
      })),
    };
  });

  const marketRows = recordsForUpsert.map((record) => ({
    ...record.market,
    winning_outcome_id: null,
  }));

    await upsertInChunks(supabase, "markets", marketRows, 100);
    await upsertInChunks(
      supabase,
      "outcomes",
      recordsForUpsert.flatMap((record) => record.outcomes),
      250,
    );

  const resolvedMarketRows = recordsForUpsert
    .filter((record) => record.market.closed && record.market.winning_outcome_id)
    .map((record) => ({
      id: record.market.id,
      winning_outcome_id: record.market.winning_outcome_id,
    }));

  for (const resolvedMarket of resolvedMarketRows) {
    const { error: resultError } = await supabase
      .from("markets")
      .update({ winning_outcome_id: resolvedMarket.winning_outcome_id })
      .eq("id", resolvedMarket.id);

    if (resultError) {
      return NextResponse.json({ error: resultError.message }, { status: 500 });
    }
  }

  const settlement = await settleResolvedPredictions(
    supabase,
    new Map(
      records
        .filter((record) => record.market.closed && record.market.winning_outcome_id)
        .map((record) => [record.market.id, record.market.winning_outcome_id as string]),
    ),
  );

    return NextResponse.json({
      ok: true,
      imported: records.length,
      apiMarkets: apiRecords.length,
      manualMarkets: 0,
      settledPredictions: settlement.settled,
      paidOutPoints: settlement.paidOutPoints,
      mode,
      syncedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : JSON.stringify(error),
      },
      { status: 500 },
    );
  }
}

async function getExistingOutcomeProbabilities(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  outcomeIds: string[],
) {
  const probabilities = new Map<string, number>();

  for (let index = 0; index < outcomeIds.length; index += 20) {
    const chunk = outcomeIds.slice(index, index + 20);
    if (!chunk.length) continue;

    const { data, error } = await supabase
      .from("outcomes")
      .select("id, probability")
      .in("id", chunk);

    if (error) {
      throw new Error(`get existing outcome probabilities: ${error.message}`);
    }

    for (const outcome of data ?? []) {
      probabilities.set(outcome.id, outcome.probability);
    }
  }

  return probabilities;
}

async function upsertInChunks(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  table: "markets" | "outcomes",
  rows: Array<Record<string, unknown>>,
  size: number,
) {
  for (let index = 0; index < rows.length; index += size) {
    const chunk = rows.slice(index, index + size);
    if (!chunk.length) continue;

    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict: "id" });

    if (error) {
      throw new Error(`upsert ${table}: ${error.message}`);
    }
  }
}

async function settleResolvedPredictions(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  winningOutcomeByMarketId: Map<string, string>,
) {
  if (!winningOutcomeByMarketId.size) {
    return { settled: 0, paidOutPoints: 0 };
  }

  const predictions = [];
  const marketIds = Array.from(winningOutcomeByMarketId.keys());

  for (let index = 0; index < marketIds.length; index += 20) {
    const chunk = marketIds.slice(index, index + 20);
    const { data, error } = await supabase
      .from("predictions")
      .select("id, profile_id, market_id, outcome_id, stake, odds")
      .eq("status", "open")
      .in("market_id", chunk);

    if (error) {
      throw new Error(`select open predictions: ${error.message}`);
    }

    predictions.push(...(data ?? []));
  }

  let settled = 0;
  let paidOutPoints = 0;
  const settledAt = new Date().toISOString();

  for (const prediction of predictions ?? []) {
    const winningOutcomeId = winningOutcomeByMarketId.get(prediction.market_id);
    if (!winningOutcomeId) {
      continue;
    }

    const { data, error } = await supabase.rpc("settle_prediction_result", {
      target_prediction_id: prediction.id,
      target_winning_outcome_id: winningOutcomeId,
      settled_timestamp: settledAt,
    });

    if (error) {
      throw new Error(`settle prediction ${prediction.id}: ${error.message}`);
    }

    const result = Array.isArray(data) ? data[0] : data;

    if (result?.settled) {
      settled += 1;
      paidOutPoints += Number(result.payout ?? 0);
    }
  }

  return { settled, paidOutPoints };
}
