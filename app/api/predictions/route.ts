import { NextResponse } from "next/server";
import { getOrCreateDemoProfile } from "@/lib/data";
import { probabilityToOdds } from "@/lib/odds";
import { createServerSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";

type PredictionRequest = {
  marketId?: string;
  outcomeId?: string;
  stake?: number;
};

type OutcomeRecord = {
  id: string;
  label: string;
  probability: number;
  market_id: string;
  markets:
    | { id: string; title: string; active: boolean }
    | Array<{ id: string; title: string; active: boolean }>
    | null;
};

function firstRelation<T>(relation: T | T[] | null) {
  return Array.isArray(relation) ? relation[0] : relation;
}

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabaseが設定されていません。" },
      { status: 503 },
    );
  }

  const body = (await request.json()) as PredictionRequest;
  const marketId = body.marketId;
  const outcomeId = body.outcomeId;
  const stake = Math.floor(Number(body.stake ?? 0));

  if (!marketId || !outcomeId || !Number.isFinite(stake) || stake < 10) {
    return NextResponse.json(
      { error: "マーケット、選択肢、10pt以上のポイントを指定してください。" },
      { status: 400 },
    );
  }

  const supabase = createServerSupabaseClient({ admin: true });

  let activeProfile;

  try {
    activeProfile = await getOrCreateDemoProfile(supabase);
  } catch {
    return NextResponse.json(
      { error: "プロフィールを取得できませんでした。" },
      { status: 500 },
    );
  }

  if (activeProfile.points < stake) {
    return NextResponse.json(
      { error: "ポイントが足りません。" },
      { status: 400 },
    );
  }

  const { data: outcomeData, error: outcomeError } = await supabase
    .from("outcomes")
    .select("id, label, probability, market_id, markets(id, title, active)")
    .eq("id", outcomeId)
    .single();

  const outcome = outcomeData as OutcomeRecord | null;
  const market = outcome ? firstRelation(outcome.markets) : null;

  if (
    outcomeError ||
    !outcome ||
    outcome.market_id !== marketId ||
    !market?.active
  ) {
    return NextResponse.json(
      { error: "このマーケットには予想できません。" },
      { status: 400 },
    );
  }

  const lockedOdds = probabilityToOdds(outcome.probability);
  const nextPoints = activeProfile.points - stake;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ points: nextPoints, updated_at: new Date().toISOString() })
    .eq("id", activeProfile.id);

  if (updateError) {
    return NextResponse.json(
      { error: "ポイントを更新できませんでした。" },
      { status: 500 },
    );
  }

  const { data: prediction, error: predictionError } = await supabase
    .from("predictions")
    .insert({
      profile_id: activeProfile.id,
      market_id: marketId,
      outcome_id: outcomeId,
      stake,
      odds: lockedOdds,
      status: "open",
    })
    .select("id, stake, odds, status, created_at")
    .single();

  if (predictionError || !prediction) {
    await supabase
      .from("profiles")
      .update({ points: activeProfile.points, updated_at: new Date().toISOString() })
      .eq("id", activeProfile.id);

    return NextResponse.json(
      { error: "予想を保存できませんでした。" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    profile: {
      points: nextPoints,
    },
    prediction: {
      id: prediction.id,
      marketTitle: market.title,
      outcomeLabel: outcome.label,
      stake: prediction.stake,
      odds: prediction.odds,
      status: prediction.status,
      createdAt: prediction.created_at,
    },
  });
}
