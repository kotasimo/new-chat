import { NextResponse } from "next/server";
import { getProfileFromRequest } from "@/lib/auth-profile";
import { probabilityToOdds } from "@/lib/odds";
import { recordPointTransaction } from "@/lib/point-transactions";
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
    | { id: string; title: string; active: boolean; closed: boolean; lock_at: string | null }
    | Array<{ id: string; title: string; active: boolean; closed: boolean; lock_at: string | null }>
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
    activeProfile = await getProfileFromRequest(request, supabase);
  } catch {
    return NextResponse.json(
      { error: "ゲスト情報を取得できませんでした。ページを再読み込みしてください。" },
      { status: 401 },
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
    .select(
      "id, label, probability, market_id, markets!outcomes_market_id_fkey(id, title, active, closed, lock_at)",
    )
    .eq("id", outcomeId)
    .single();

  const outcome = outcomeData as OutcomeRecord | null;
  const market = outcome ? firstRelation(outcome.markets) : null;

  if (outcomeError) {
    const message =
      outcomeError.code === "PGRST116"
        ? "選択肢が見つかりません。ページを再読み込みしてからもう一度選んでください。"
        : "選択肢を確認できませんでした。少し待ってからもう一度試してください。";

    return NextResponse.json(
      { error: message },
      { status: 400 },
    );
  }

  if (!outcome || outcome.market_id !== marketId || !market) {
    return NextResponse.json(
      { error: "選択中のマーケット情報が古くなっています。ページを再読み込みしてください。" },
      { status: 400 },
    );
  }

  if (!market.active || market.closed) {
    return NextResponse.json(
      { error: "このマーケットは現在予想できません。" },
      { status: 400 },
    );
  }

  if (isLocked(market.lock_at)) {
    return NextResponse.json(
      { error: "このマーケットは締切済みです。" },
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
      probability_at_prediction: outcome.probability,
      status: "open",
    })
    .select("id, stake, odds, probability_at_prediction, status, created_at")
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

  try {
    await recordPointTransaction(supabase, {
      profileId: activeProfile.id,
      predictionId: prediction.id,
      transactionKey: `stake:${prediction.id}`,
      type: "prediction_stake",
      amount: -stake,
      balanceAfter: nextPoints,
      description: `${market.title} / ${outcome.label} に予想`,
    });
  } catch {
    await supabase
      .from("profiles")
      .update({ points: activeProfile.points, updated_at: new Date().toISOString() })
      .eq("id", activeProfile.id);

    await supabase
      .from("predictions")
      .delete()
      .eq("id", prediction.id);

    return NextResponse.json(
      { error: "ポイント台帳を記録できませんでした。" },
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
      probabilityAtPrediction: prediction.probability_at_prediction,
      status: prediction.status,
      createdAt: prediction.created_at,
    },
  });
}

function isLocked(lockAt: string | null) {
  return Boolean(lockAt && new Date(lockAt).getTime() <= Date.now());
}
