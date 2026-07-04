import { initialMarkets } from "@/lib/mock-markets";
import { getOrCreateProfileForUser } from "@/lib/auth-profile";
import { createServerSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";
import type {
  Market,
  MarketCategory,
  PredictionHistoryItem,
  RankingItem,
  UserProfile,
} from "@/lib/types";
import { localizeVolumeLabel } from "@/lib/volume";

const DEMO_EMAIL = "demo@yosoku-cup.local";
const MARKET_SELECT =
  "id, slug, category, code, title, note, volume_label, source, polymarket_slug, closed, closed_at, starts_at, lock_at, winning_outcome_id, outcomes!outcomes_market_id_fkey(id, label, probability, side, final_price, winning)";

type MarketRecord = {
  id: string;
  slug: string;
  category: string;
  code: string;
  title: string;
  note: string;
  volume_label: string;
  source: string;
  polymarket_slug: string | null;
  closed: boolean;
  closed_at: string | null;
  starts_at: string | null;
  lock_at: string | null;
  winning_outcome_id: string | null;
  outcomes: Array<{
    id: string;
    label: string;
    probability: number;
    side: string;
    final_price: number | null;
    winning: boolean;
  }>;
};

export async function getHomeMarkets(): Promise<Market[]> {
  try {
    if (!hasSupabaseConfig()) {
      return initialMarkets;
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("markets")
      .select(MARKET_SELECT)
      .eq("active", true)
      .eq("closed", false)
      .order("sort_order", { ascending: true })
      .order("sort_order", { ascending: true, referencedTable: "outcomes" });

    if (error) {
      throw error;
    }

    const records = (data ?? []) as MarketRecord[];

    if (!records.length) {
      return initialMarkets;
    }

    return records.map((market) => ({
      id: market.id,
      slug: market.slug,
      category: market.category as MarketCategory,
      code: market.code,
      title: market.title,
      note: market.note,
      volumeLabel: localizeVolumeLabel(market.volume_label),
      source: market.source as Market["source"],
      polymarketSlug: market.polymarket_slug ?? undefined,
      closed: market.closed,
      closedAt: market.closed_at ?? undefined,
      startsAt: market.starts_at ?? undefined,
      lockAt: market.lock_at ?? undefined,
      winningOutcomeId: market.winning_outcome_id ?? undefined,
      outcomes: market.outcomes.map((outcome) => ({
        id: outcome.id,
        label: outcome.label,
        probability: outcome.probability,
        side: outcome.side as "yes" | "no" | "other",
        finalPrice: outcome.final_price ?? undefined,
        winning: outcome.winning,
      })),
    }));
  } catch {
    return initialMarkets;
  }
}

export async function getClosedMarkets(limit = 80): Promise<Market[]> {
  try {
    if (!hasSupabaseConfig()) {
      return [];
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("markets")
      .select(MARKET_SELECT)
      .eq("active", true)
      .eq("closed", true)
      .order("closed_at", { ascending: false, nullsFirst: false })
      .order("sort_order", { ascending: true, referencedTable: "outcomes" })
      .limit(limit);

    if (error) {
      throw error;
    }

    return ((data ?? []) as MarketRecord[]).map((market) => ({
      id: market.id,
      slug: market.slug,
      category: market.category as MarketCategory,
      code: market.code,
      title: market.title,
      note: market.note,
      volumeLabel: localizeVolumeLabel(market.volume_label),
      source: market.source as Market["source"],
      polymarketSlug: market.polymarket_slug ?? undefined,
      closed: market.closed,
      closedAt: market.closed_at ?? undefined,
      startsAt: market.starts_at ?? undefined,
      lockAt: market.lock_at ?? undefined,
      winningOutcomeId: market.winning_outcome_id ?? undefined,
      outcomes: market.outcomes.map((outcome) => ({
        id: outcome.id,
        label: outcome.label,
        probability: outcome.probability,
        side: outcome.side as "yes" | "no" | "other",
        finalPrice: outcome.final_price ?? undefined,
        winning: outcome.winning,
      })),
    }));
  } catch {
    return [];
  }
}

export async function getDemoProfile(): Promise<UserProfile> {
  if (!hasSupabaseConfig()) {
    return { id: "local-demo", displayName: "あなた", points: 10000 };
  }

  try {
    const supabase = createServerSupabaseClient({ admin: true });
    return await getOrCreateDemoProfile(supabase);
  } catch {
    return { id: "local-demo", displayName: "あなた", points: 10000 };
  }
}

export async function getOrCreateDemoProfile(
  supabase = createServerSupabaseClient({ admin: true }),
): Promise<UserProfile> {
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (usersError) {
    throw usersError;
  }

  let userId = users.users.find((user) => user.email === DEMO_EMAIL)?.id;

  if (!userId) {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: `${crypto.randomUUID()}${crypto.randomUUID()}`,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      throw authError ?? new Error("Demo user could not be created.");
    }

    userId = authData.user.id;
  }

  return getOrCreateProfileForUser(supabase, userId, "あなた");
}

type PredictionRecord = {
  id: string;
  stake: number;
  odds: number;
  probability_at_prediction: number;
  status: "open" | "won" | "lost" | "void";
  payout: number | null;
  settled_at: string | null;
  created_at: string;
  markets: { title: string } | Array<{ title: string }> | null;
  outcomes: { label: string } | Array<{ label: string }> | null;
};

function firstRelation<T>(relation: T | T[] | null) {
  return Array.isArray(relation) ? relation[0] : relation;
}

export async function getDemoPredictionHistory(
  profileId?: string,
  limit = 8,
): Promise<PredictionHistoryItem[]> {
  if (!hasSupabaseConfig()) {
    return [];
  }

  try {
    const supabase = createServerSupabaseClient({ admin: true });
    const activeProfileId = profileId ?? (await getOrCreateDemoProfile(supabase)).id;
    const { data, error } = await supabase
      .from("predictions")
      .select("id, stake, odds, probability_at_prediction, status, payout, settled_at, created_at, markets!predictions_market_id_fkey(title), outcomes!predictions_outcome_id_fkey(label)")
      .eq("profile_id", activeProfileId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return ((data ?? []) as PredictionRecord[]).map((prediction) => {
      const market = firstRelation(prediction.markets);
      const outcome = firstRelation(prediction.outcomes);

      return {
        id: prediction.id,
        marketTitle: market?.title ?? "不明なマーケット",
        outcomeLabel: outcome?.label ?? "不明な選択肢",
        stake: prediction.stake,
        odds: prediction.odds,
        probabilityAtPrediction: prediction.probability_at_prediction,
        status: prediction.status,
        payout: prediction.payout ?? undefined,
        settledAt: prediction.settled_at ?? undefined,
        createdAt: prediction.created_at,
      };
    });
  } catch {
    return [];
  }
}

export async function getRanking(limit = 50): Promise<RankingItem[]> {
  if (!hasSupabaseConfig()) {
    return [];
  }

  try {
    const supabase = createServerSupabaseClient({ admin: true });
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, points")
      .order("points", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data ?? []).map((profile) => ({
      id: profile.id,
      displayName: profile.display_name || `ゲスト ${profile.id.slice(0, 4)}`,
      points: profile.points,
    }));
  } catch {
    return [];
  }
}
