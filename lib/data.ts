import { initialMarkets } from "@/lib/mock-markets";
import { createServerSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";
import type { Market, MarketCategory, PredictionHistoryItem, UserProfile } from "@/lib/types";

const DEMO_EMAIL = "demo@yosoku-cup.local";

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
  outcomes: Array<{
    id: string;
    label: string;
    probability: number;
    side: string;
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
      .select("id, slug, category, code, title, note, volume_label, source, polymarket_slug, outcomes(id, label, probability, side)")
      .eq("active", true)
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
      volumeLabel: market.volume_label,
      source: market.source as Market["source"],
      polymarketSlug: market.polymarket_slug ?? undefined,
      outcomes: market.outcomes.map((outcome) => ({
        id: outcome.id,
        label: outcome.label,
        probability: outcome.probability,
        side: outcome.side as "yes" | "no" | "other",
      })),
    }));
  } catch {
    return initialMarkets;
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

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("profiles")
    .select("id, points")
    .eq("id", userId)
    .maybeSingle();

  if (existingProfileError) {
    throw existingProfileError;
  }

  const { data: profile, error: profileError } = existingProfile
    ? { data: existingProfile, error: null }
    : await supabase
    .from("profiles")
    .insert({
      id: userId,
      points: 10000,
    })
    .select("id, points")
    .single();

  if (profileError || !profile) {
    throw profileError ?? new Error("Demo profile could not be created.");
  }

  return {
    id: profile.id,
    displayName: "あなた",
    points: profile.points,
  };
}

type PredictionRecord = {
  id: string;
  stake: number;
  odds: number;
  status: "open" | "won" | "lost" | "void";
  created_at: string;
  markets: { title: string } | Array<{ title: string }> | null;
  outcomes: { label: string } | Array<{ label: string }> | null;
};

function firstRelation<T>(relation: T | T[] | null) {
  return Array.isArray(relation) ? relation[0] : relation;
}

export async function getDemoPredictionHistory(): Promise<PredictionHistoryItem[]> {
  if (!hasSupabaseConfig()) {
    return [];
  }

  try {
    const supabase = createServerSupabaseClient({ admin: true });
    const profile = await getOrCreateDemoProfile(supabase);
    const { data, error } = await supabase
      .from("predictions")
      .select("id, stake, odds, status, created_at, markets(title), outcomes(label)")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(8);

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
        status: prediction.status,
        createdAt: prediction.created_at,
      };
    });
  } catch {
    return [];
  }
}
