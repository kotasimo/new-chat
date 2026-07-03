import { NextResponse } from "next/server";
import {
  buildAppMarketRecordsFromEvents,
  fetchPolymarketWorldCupEvents,
} from "@/lib/polymarket";
import { createServerSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const syncSecret = process.env.SYNC_SECRET;
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

  const supabase = createServerSupabaseClient({ admin: true });
  const gammaEvents = await fetchPolymarketWorldCupEvents(80);
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
  const recordsForUpsert = records.map((record) => ({
    market: record.market,
    outcomes: record.outcomes.map((outcome) => ({
      ...outcome,
      probability: record.market.closed
        ? existingOutcomeProbabilityById.get(outcome.id) ?? outcome.probability
        : outcome.probability,
    })),
  }));

  const marketRows = recordsForUpsert.map((record) => ({
    ...record.market,
    winning_outcome_id: null,
  }));

  const { error: marketError } = await supabase
    .from("markets")
    .upsert(marketRows, { onConflict: "id" });

  if (marketError) {
    return NextResponse.json({ error: marketError.message }, { status: 500 });
  }

  const { error: outcomeError } = await supabase
    .from("outcomes")
    .upsert(recordsForUpsert.flatMap((record) => record.outcomes), { onConflict: "id" });

  if (outcomeError) {
    return NextResponse.json({ error: outcomeError.message }, { status: 500 });
  }

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
    syncedAt,
  });
}

async function getExistingOutcomeProbabilities(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  outcomeIds: string[],
) {
  const probabilities = new Map<string, number>();

  for (let index = 0; index < outcomeIds.length; index += 1000) {
    const chunk = outcomeIds.slice(index, index + 1000);
    if (!chunk.length) continue;

    const { data, error } = await supabase
      .from("outcomes")
      .select("id, probability")
      .in("id", chunk);

    if (error) {
      throw error;
    }

    for (const outcome of data ?? []) {
      probabilities.set(outcome.id, outcome.probability);
    }
  }

  return probabilities;
}

async function settleResolvedPredictions(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  winningOutcomeByMarketId: Map<string, string>,
) {
  if (!winningOutcomeByMarketId.size) {
    return { settled: 0, paidOutPoints: 0 };
  }

  const { data: predictions, error } = await supabase
    .from("predictions")
    .select("id, profile_id, market_id, outcome_id, stake, odds")
    .eq("status", "open")
    .in("market_id", Array.from(winningOutcomeByMarketId.keys()));

  if (error) {
    throw error;
  }

  let settled = 0;
  let paidOutPoints = 0;
  const settledAt = new Date().toISOString();

  for (const prediction of predictions ?? []) {
    const winningOutcomeId = winningOutcomeByMarketId.get(prediction.market_id);
    const won = prediction.outcome_id === winningOutcomeId;
    const payout = won ? Math.round(prediction.stake * prediction.odds) : 0;

    const { error: predictionError } = await supabase
      .from("predictions")
      .update({
        status: won ? "won" : "lost",
        payout,
        settled_at: settledAt,
      })
      .eq("id", prediction.id)
      .eq("status", "open");

    if (predictionError) {
      throw predictionError;
    }

    if (won && payout > 0) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("points")
        .eq("id", prediction.profile_id)
        .single();

      if (profileError) {
        throw profileError;
      }

      const { error: pointsError } = await supabase
        .from("profiles")
        .update({
          points: profile.points + payout,
          updated_at: settledAt,
        })
        .eq("id", prediction.profile_id);

      if (pointsError) {
        throw pointsError;
      }

      paidOutPoints += payout;
    }

    settled += 1;
  }

  return { settled, paidOutPoints };
}
