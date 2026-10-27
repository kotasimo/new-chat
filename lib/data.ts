import type { LeagueId } from "@/lib/leagues";
import { initialMarkets } from "@/lib/mock-markets";
import { getOrCreateProfileForUser } from "@/lib/auth-profile";
import { createServerSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;
import type {
  Market,
  MarketCategory,
  PredictionHistoryItem,
  RankingItem,
  UserProfile,
} from "@/lib/types";
import { localizeVolumeLabel, volumeLabelToUsdValue } from "@/lib/volume";

const DEMO_EMAIL = "demo@yosoku-cup.local";
const MARKET_SELECT =
  "id, slug, league, category, code, title, note, volume_label, source, polymarket_slug, closed, closed_at, starts_at, lock_at, synced_at, winning_outcome_id, outcomes!outcomes_market_id_fkey(id, label, probability, side, final_price, winning)";

type MarketRecord = {
  id: string;
  slug: string;
  league: string;
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
  synced_at: string | null;
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

function toMarket(market: MarketRecord): Market {
  return {
    id: market.id,
    slug: market.slug,
    league: market.league as LeagueId,
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
    syncedAt: market.synced_at ?? undefined,
    winningOutcomeId: market.winning_outcome_id ?? undefined,
    outcomes: market.outcomes.map((outcome) => ({
      id: outcome.id,
      label: outcome.label,
      probability: outcome.probability,
      side: outcome.side as "yes" | "no" | "other",
      finalPrice: outcome.final_price ?? undefined,
      winning: outcome.winning,
    })),
  };
}

/**
 * live   … Supabaseから取れた本物のマーケット
 * sample … Supabase未設定なので、見た目確認用のサンプルを出している
 * error  … 設定はあるが読み込みに失敗した
 */
export type MarketSource = "live" | "sample" | "error";

export type HomeMarkets = {
  markets: Market[];
  source: MarketSource;
};

export async function getHomeMarkets(league: LeagueId): Promise<HomeMarkets> {
  if (!hasSupabaseConfig()) {
    return { markets: initialMarkets, source: "sample" };
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("markets")
      .select(MARKET_SELECT)
      .eq("league", league)
      .eq("active", true)
      .eq("closed", false)
      .order("sort_order", { ascending: true })
      .order("sort_order", { ascending: true, referencedTable: "outcomes" });

    if (error) {
      throw error;
    }

    const records = (data ?? []) as MarketRecord[];

    // 0件はエラーではない。サンプルで埋めると、別リーグの偽物が出てしまう。
    const markets = records.map(toMarket);

    return { markets, source: "live" };
  } catch {
    // 読み込めないときにサンプルを出すと、偽のマーケットを本物として見せてしまう。
    return { markets: [], source: "error" };
  }
}

/**
 * リーグをまたいだ注目マーケット。出来高の数値は列に持っていないので、
 * 各リーグの上位だけを取ってきて、表示用のラベルから金額を読み直して並べる。
 */
/** ホームの先頭に出す、キックオフが近い試合。出来高順だと通期の市場ばかりになるため。 */
export async function getUpcomingFixtures(limit = 6): Promise<Market[]> {
  if (!hasSupabaseConfig()) {
    return initialMarkets.filter((market) => market.category === "match").slice(0, limit);
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("markets")
      .select(MARKET_SELECT)
      .eq("active", true)
      .eq("closed", false)
      .eq("category", "match")
      .gt("lock_at", new Date().toISOString())
      .order("lock_at", { ascending: true })
      .order("sort_order", { ascending: true, referencedTable: "outcomes" })
      .limit(120);

    if (error) {
      throw error;
    }

    return ((data ?? []) as MarketRecord[])
      .filter((market) => market.title.endsWith("試合結果は？"))
      .slice(0, limit)
      .map(toMarket);
  } catch {
    return [];
  }
}

export async function getFeaturedMarkets(limit = 12): Promise<HomeMarkets> {
  if (!hasSupabaseConfig()) {
    return { markets: initialMarkets.slice(0, limit), source: "sample" };
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("markets")
      .select(MARKET_SELECT)
      .eq("active", true)
      .eq("closed", false)
      .order("sort_order", { ascending: true })
      .order("sort_order", { ascending: true, referencedTable: "outcomes" })
      .limit(240);

    if (error) {
      throw error;
    }

    const markets = ((data ?? []) as MarketRecord[]).map(toMarket);
    const ranked = [...markets].sort(
      (a, b) => volumeOf(b.volumeLabel) - volumeOf(a.volumeLabel),
    );

    return { markets: ranked.slice(0, limit), source: "live" };
  } catch {
    return { markets: [], source: "error" };
  }
}

function volumeOf(label: string) {
  return volumeLabelToUsdValue(label) ?? 0;
}

export async function getClosedMarkets(league: LeagueId, limit = 80): Promise<Market[]> {
  try {
    if (!hasSupabaseConfig()) {
      return [];
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("markets")
      .select(MARKET_SELECT)
      .eq("league", league)
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
      league: market.league as LeagueId,
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
      syncedAt: market.synced_at ?? undefined,
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

/**
 * 結果待ちの賭け金を人ごとに合計する。賭けた瞬間に points から引いているので、
 * これを足し戻さないと「賭けるほど資産が減る」ように見えてしまう。
 */
export async function getOpenStakesByProfile(supabase: SupabaseClient) {
  const locked = new Map<string, number>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("predictions")
      .select("profile_id, stake")
      .eq("status", "open")
      .range(from, from + pageSize - 1);

    if (error) throw error;

    for (const row of data ?? []) {
      locked.set(row.profile_id, (locked.get(row.profile_id) ?? 0) + row.stake);
    }

    if (!data || data.length < pageSize) break;
  }

  return locked;
}

export async function getRanking(limit = 50): Promise<RankingItem[]> {
  if (!hasSupabaseConfig()) {
    return [];
  }

  try {
    const supabase = createServerSupabaseClient({ admin: true });
    const locked = await getOpenStakesByProfile(supabase);

    // 拘束中を足してから並べ直すので、現金だけで足切りすると取りこぼす。
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, points")
      .order("points", { ascending: false })
      .limit(Math.max(limit * 4, 200));

    if (error) throw error;

    return (data ?? [])
      .map((profile) => ({
        id: profile.id,
        displayName: profile.display_name || `ゲスト ${profile.id.slice(0, 4)}`,
        points: profile.points,
        lockedPoints: locked.get(profile.id) ?? 0,
        assets: profile.points + (locked.get(profile.id) ?? 0),
      }))
      .sort((a, b) => b.assets - a.assets)
      .slice(0, limit);
  } catch {
    return [];
  }
}
