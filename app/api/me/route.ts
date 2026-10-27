import { NextResponse } from "next/server";
import { getProfileFromRequest } from "@/lib/auth-profile";
import { getOpenStakesByProfile } from "@/lib/data";
import {
  buildBadges,
  buildBreakdowns,
  summarize,
  type SettledPrediction,
} from "@/lib/my-stats";
import { createServerSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  stake: number;
  odds: number;
  status: string;
  payout: number | null;
  settled_at: string | null;
  created_at: string;
  markets: { title: string; league: string } | Array<{ title: string; league: string }> | null;
  outcomes: { label: string } | Array<{ label: string }> | null;
};

function first<T>(relation: T | T[] | null) {
  return Array.isArray(relation) ? relation[0] : relation;
}

export async function GET(request: Request) {
  if (!hasSupabaseConfig() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabaseが設定されていません。" }, { status: 503 });
  }

  const supabase = createServerSupabaseClient({ admin: true });

  try {
    const profile = await getProfileFromRequest(request, supabase);

    const [{ data: rows }, { data: ledger }, { data: others }, locked] = await Promise.all([
      supabase
        .from("predictions")
        .select(
          "id, stake, odds, status, payout, settled_at, created_at, markets!predictions_market_id_fkey(title, league), outcomes!predictions_outcome_id_fkey(label)",
        )
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("point_transactions")
        .select("balance_after, created_at")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: true })
        .limit(500),
      supabase.from("profiles").select("id, points, created_at"),
      getOpenStakesByProfile(supabase),
    ]);

    const predictions = ((rows ?? []) as Row[]).map((row) => {
      const market = first(row.markets);

      return {
        id: row.id,
        marketTitle: market?.title ?? "不明なマーケット",
        league: market?.league ?? "",
        outcomeLabel: first(row.outcomes)?.label ?? "不明な選択肢",
        stake: row.stake,
        odds: row.odds,
        status: row.status as "open" | "won" | "lost" | "void",
        payout: row.payout ?? 0,
        settledAt: row.settled_at ?? undefined,
        createdAt: row.created_at,
      };
    });

    const settled = predictions.filter(
      (p): p is typeof p & SettledPrediction => p.status !== "open",
    );
    const breakdowns = buildBreakdowns(settled);

    const lockedPoints = locked.get(profile.id) ?? 0;
    const assets = profile.points + lockedPoints;
    const rank =
      (others ?? []).filter(
        (other) =>
          other.id !== profile.id && other.points + (locked.get(other.id) ?? 0) > assets,
      ).length + 1;

    return NextResponse.json({
      profile: {
        displayName: profile.displayName,
        points: profile.points,
        createdAt: (others ?? []).find((o) => o.id === profile.id)?.created_at ?? null,
      },
      assets,
      lockedPoints,
      rank,
      totalProfiles: (others ?? []).length,
      summary: summarize(settled),
      balanceHistory: (ledger ?? []).map((row) => ({
        at: row.created_at,
        balance: row.balance_after,
      })),
      breakdowns,
      badges: buildBadges(settled, breakdowns),
      predictions,
    });
  } catch {
    return NextResponse.json({ error: "情報を取得できませんでした。" }, { status: 401 });
  }
}
