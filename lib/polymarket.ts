import { countryToJapanese } from "@/lib/countries";
import { playerNameToJapanese } from "@/lib/player-names";

type GammaMarket = {
  question: string;
  slug: string;
  groupItemTitle?: string | null;
  outcomePrices?: string;
  outcomes?: string;
  volume?: number | string | null;
  volumeNum?: number | string | null;
  volume24hr?: number | string | null;
};

type GammaEvent = {
  title: string;
  slug: string;
  volume?: number | string | null;
  volume24hr?: number | string | null;
  markets?: GammaMarket[];
};

type AppMarketRecord = {
  market: {
    id: string;
    slug: string;
    category: "match" | "winner" | "special";
    code: string;
    title: string;
    note: string;
    volume_label: string;
    source: "polymarket";
    polymarket_slug: string;
    active: boolean;
    sort_order: number;
    synced_at: string;
  };
  outcomes: Array<{
    id: string;
    market_id: string;
    label: string;
    probability: number;
    side: "yes" | "no" | "other";
    sort_order: number;
  }>;
};

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const FIFA_WORLD_CUP_TAG_ID = "102232";
const WORLD_CUP_2026_TAG_ID = "102350";

export async function fetchPolymarketWorldCupEvents(limit = 80) {
  const events = await Promise.all([
    fetchGammaEvents(FIFA_WORLD_CUP_TAG_ID, limit),
    fetchGammaEvents(WORLD_CUP_2026_TAG_ID, limit),
  ]);

  const bySlug = new Map<string, GammaEvent>();
  events.flat().forEach((event) => {
    if (event.markets?.length) {
      bySlug.set(event.slug, event);
    }
  });

  return Array.from(bySlug.values()).sort(
    (a, b) => Number(b.volume24hr ?? 0) - Number(a.volume24hr ?? 0),
  );
}

export function buildAppMarketRecordsFromEvents(events: GammaEvent[]) {
  const records: AppMarketRecord[] = [];
  const eventSlugsWithAdvanceMarket = new Set(
    events
      .filter(isMoreMarketsEvent)
      .filter((event) =>
        (event.markets ?? []).some((market) => market.question.endsWith(": Team to Advance")),
      )
      .map((event) => event.slug.replace("more-markets", "").replace(/-$/, "")),
  );

  for (const event of events) {
    if (isMainMatchEvent(event)) {
      if (eventSlugsWithAdvanceMarket.has(event.slug)) {
        continue;
      }

      const record = toMatchFallbackRecord(event, 10 + records.length * 10);
      if (record) records.push(record);
      continue;
    }

    if (isMoreMarketsEvent(event)) {
      records.push(...toSelectedMoreMarketRecords(event, 200 + records.length * 10));
      continue;
    }

    if (isUsefulFutureEvent(event)) {
      const record = toFutureGroupedRecord(event, 500 + records.length * 10);
      if (record) records.push(record);
    }
  }

  return records.slice(0, 45);
}

function toMatchFallbackRecord(event: GammaEvent, sortOrder: number): AppMarketRecord | null {
  const teams = parseMatchTitle(event.title);
  if (!teams) return null;

  const outcomes = event.markets
    ?.map((market) => {
      const yesPrice = getOutcomePrice(market, "Yes");
      if (yesPrice <= 0) return null;

      return {
        label: matchOutcomeLabel(market.groupItemTitle || market.question, teams),
        probability: yesPrice,
      };
    })
    .filter(
      (outcome): outcome is { label: string; probability: number } =>
        outcome !== null && outcome.label !== "引き分け",
    );

  if (!outcomes || outcomes.length < 2) return null;

  const total = outcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
  const ordered = orderMatchOutcomes(
    outcomes.map((outcome) => ({
      ...outcome,
      probability: total > 0 ? outcome.probability / total : outcome.probability,
    })),
    teams,
  );
  const id = `polymarket-event-${event.slug}`;

  return {
    market: {
      id,
      slug: event.slug,
      category: "match",
      code: `${teamCode(teams.home)}-${teamCode(teams.away)}`,
      title: `${toJa(teams.home)} vs ${toJa(teams.away)}: 勝ち上がるのは？`,
      note: "勝敗2択・引き分けなし",
      volume_label: formatVolumeLabel(event.volume),
      source: "polymarket",
      polymarket_slug: event.slug,
      active: true,
      sort_order: sortOrder,
      synced_at: new Date().toISOString(),
    },
    outcomes: ordered.map((outcome, index) => ({
      id: `${id}-${index}`,
      market_id: id,
      label: outcome.label,
      probability: clampProbability(outcome.probability),
      side: index === 0 ? "yes" : index === 1 ? "no" : "other",
      sort_order: index,
    })),
  };
}

function toSelectedMoreMarketRecords(event: GammaEvent, baseSortOrder: number) {
  const teams = parseMatchTitle(event.title.replace(" - More Markets", ""));
  if (!teams) return [];

  const records: AppMarketRecord[] = [];
  const advanceMarket = (event.markets ?? []).find((market) =>
    market.question.endsWith(": Team to Advance"),
  );

  if (advanceMarket) {
    records.push(toTeamAdvanceRecord(advanceMarket, teams, baseSortOrder - 150));
  }

  const wanted = (event.markets ?? []).filter((market) =>
    isWantedDetailMarket(market.question, teams),
  );

  records.push(
    ...wanted.slice(0, 6).map((market, index) =>
      toTwoOutcomeRecord({
        market,
        id: `polymarket-market-${market.slug}`,
        category: "special",
        code: "DET",
        title: translateMoreMarketQuestion(market.question, teams),
        note: `${toJa(teams.home)} vs ${toJa(teams.away)} 詳細予測`,
        sortOrder: baseSortOrder + index,
      }),
    ),
  );

  return records;
}

function toTeamAdvanceRecord(
  market: GammaMarket,
  teams: { home: string; away: string },
  sortOrder: number,
): AppMarketRecord {
  const outcomes = parseGammaOutcomes(market);
  const id = `polymarket-market-${market.slug}`;

  return {
    market: {
      id,
      slug: market.slug,
      category: "match",
      code: `${teamCode(teams.home)}-${teamCode(teams.away)}`,
      title: `${toJa(teams.home)} vs ${toJa(teams.away)}: 勝ち上がるのは？`,
      note: "延長・PK込み",
      volume_label: formatVolumeLabel(market.volumeNum ?? market.volume),
      source: "polymarket",
      polymarket_slug: market.slug,
      active: true,
      sort_order: sortOrder,
      synced_at: new Date().toISOString(),
    },
    outcomes: outcomes.map((outcome, index) => ({
      id: `${id}-${index}`,
      market_id: id,
      label: toJa(outcome.label),
      probability: clampProbability(outcome.probability),
      side: index === 0 ? "yes" : index === 1 ? "no" : "other",
      sort_order: index,
    })),
  };
}

function toFutureGroupedRecord(event: GammaEvent, sortOrder: number): AppMarketRecord | null {
  const topMarkets = (event.markets ?? [])
    .map((market) => ({
      market,
      probability: getOutcomePrice(market, "Yes"),
      label: toJa(market.groupItemTitle || extractFutureItem(market.question)),
    }))
    .filter((item) => item.probability > 0.001 && item.label && !item.label.includes("Team "))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 10);

  if (topMarkets.length < 2) return null;

  const id = `polymarket-event-${event.slug}`;

  return {
    market: {
      id,
      slug: event.slug,
      category: event.slug === "world-cup-winner" ? "winner" : "special",
      code: futureCode(event.slug),
      title: translateFutureTitle(event.title),
      note: "Polymarketイベントを選択肢に整理",
      volume_label: formatVolumeLabel(event.volume),
      source: "polymarket",
      polymarket_slug: event.slug,
      active: true,
      sort_order: sortOrder,
      synced_at: new Date().toISOString(),
    },
    outcomes: topMarkets.map((item, index) => ({
      id: `${id}-${item.market.slug}`,
      market_id: id,
      label: item.label,
      probability: clampProbability(item.probability),
      side: index === 0 ? "yes" : index === 1 ? "no" : "other",
      sort_order: index,
    })),
  };
}

function toTwoOutcomeRecord({
  market,
  id,
  category,
  code,
  title,
  note,
  sortOrder,
}: {
  market: GammaMarket;
  id: string;
  category: "match" | "winner" | "special";
  code: string;
  title: string;
  note: string;
  sortOrder: number;
}): AppMarketRecord {
  const outcomes = parseGammaOutcomes(market);

  return {
    market: {
      id,
      slug: market.slug,
      category,
      code,
      title,
      note,
      volume_label: formatVolumeLabel(market.volumeNum ?? market.volume),
      source: "polymarket",
      polymarket_slug: market.slug,
      active: true,
      sort_order: sortOrder,
      synced_at: new Date().toISOString(),
    },
    outcomes: outcomes.map((outcome, index) => ({
      id: `${id}-${index}`,
      market_id: id,
      label: translateOutcome(outcome.label),
      probability: clampProbability(outcome.probability),
      side: index === 0 ? "yes" : index === 1 ? "no" : "other",
      sort_order: index,
    })),
  };
}

function isMainMatchEvent(event: GammaEvent) {
  return /^.+ vs\. .+$/.test(event.title) && !event.title.includes(" - ");
}

function isMoreMarketsEvent(event: GammaEvent) {
  return /^.+ vs\. .+ - More Markets$/.test(event.title);
}

function isUsefulFutureEvent(event: GammaEvent) {
  return [
    "world-cup-winner",
    "which-continent-will-win-the-world-cup",
    "world-cup-golden-boot-winner",
    "world-cup-golden-ball-winner",
    "world-cup-nation-to-reach-final",
    "world-cup-nation-to-reach-semifinals",
    "world-cup-nation-to-reach-quarterfinals",
  ].includes(event.slug);
}

function parseGammaOutcomes(market: GammaMarket) {
  const labels = safeJsonArray(market.outcomes);
  const prices = safeJsonArray(market.outcomePrices).map(Number);

  return labels.map((label, index) => ({
    label: String(label),
    probability: Number.isFinite(prices[index]) ? prices[index] : 0,
  }));
}

async function fetchGammaEvents(tagId: string, limit: number) {
  const url = new URL("/events", GAMMA_BASE_URL);
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("tag_id", tagId);
  url.searchParams.set("order", "volume24hr");
  url.searchParams.set("ascending", "false");

  const response = await fetch(url, {
    next: { revalidate: 60 },
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Polymarket API error: ${response.status}`);
  }

  return (await response.json()) as GammaEvent[];
}

function getOutcomePrice(market: GammaMarket, label: string) {
  return parseGammaOutcomes(market).find((outcome) => outcome.label === label)?.probability ?? 0;
}

function parseMatchTitle(title: string) {
  const match = title.match(/^(.+) vs\. (.+)$/);
  if (!match) return null;

  return { home: match[1], away: match[2] };
}

function matchOutcomeLabel(value: string, teams: { home: string; away: string }) {
  if (value.includes("Draw")) return "引き分け";
  if (value === teams.home) return `${toJa(teams.home)}勝利`;
  if (value === teams.away) return `${toJa(teams.away)}勝利`;
  return toJa(value);
}

function orderMatchOutcomes(
  outcomes: Array<{ label: string; probability: number }>,
  teams: { home: string; away: string },
) {
  const home = `${toJa(teams.home)}勝利`;
  const away = `${toJa(teams.away)}勝利`;
  const draw = "引き分け";
  const order = [home, draw, away];

  return outcomes.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
}

function translateMoreMarketQuestion(question: string, teams: { home: string; away: string }) {
  const prefix = `${teams.home} vs. ${teams.away}: `;
  const body = question.replace(prefix, "");
  const matchLabel = `${toJa(teams.home)} vs ${toJa(teams.away)}`;

  if (body === "Both Teams to Score") return `${matchLabel}: 両チーム得点する？`;
  if (body === "1st Half O/U 0.5") return `${matchLabel}: 前半に1点以上入る？`;
  if (body === "O/U 2.5") return `${matchLabel}: 合計3点以上？`;
  if (body === "Will the Match Go to a Penalty Shootout?") return `${matchLabel}: PK戦になる？`;
  if (body === `${teams.home} O/U 1.5`) return `${toJa(teams.home)}は2点以上取る？`;
  if (body === `${teams.away} O/U 0.5`) return `${toJa(teams.away)}は得点する？`;

  return `${matchLabel}: ${body}`;
}

function isWantedDetailMarket(question: string, teams: { home: string; away: string }) {
  const body = question.replace(`${teams.home} vs. ${teams.away}: `, "");

  return [
    "Both Teams to Score",
    "O/U 2.5",
    "1st Half O/U 0.5",
    "Will the Match Go to a Penalty Shootout?",
    `${teams.home} O/U 1.5`,
    `${teams.away} O/U 0.5`,
  ].includes(body);
}

function translateFutureTitle(title: string) {
  const normalized = title.trim();

  const translations: Record<string, string> = {
    "World Cup Winner": "優勝国は？",
    "Which continent will win the World Cup?": "優勝国の大陸は？",
    "World Cup: Golden Boot Winner": "得点王は？",
    "World Cup: Golden Ball Winner": "大会MVPは？",
    "World Cup: Nation to Reach Final": "決勝に進む国は？",
    "World Cup: Nation To Reach Semifinals": "準決勝に進む国は？",
    "World Cup: Nation To Reach Quarterfinals": "準々決勝に進む国は？",
    "World Cup: Nation To Reach Round of 16": "ベスト16に進む国は？",
    "World Cup: Nation of Top Goalscorer": "得点王の国籍は？",
    "World Cup: Top Scorer (Nation)": "得点王の国籍は？",
    "World Cup: Number of Missed Penalties": "失敗PKの数は？",
    "World Cup: No. of Matches Decided by Penalty Shootout": "PK戦で決まる試合数は？",
    "World Cup: Unbeaten Champion?": "無敗優勝はある？",
  };

  return translations[normalized] ?? normalized;
}

function extractFutureItem(question: string) {
  return question
    .replace(/^Will /, "")
    .replace(/ win the 2026 FIFA World Cup\?$/, "")
    .replace(/ be the top goalscorer at the 2026 FIFA World Cup\?$/, "")
    .replace(/ win the Golden Ball at the 2026 FIFA World Cup$/, "")
    .replace(/^Will a player representing /, "")
    .replace(/ be the top goalscorer at the 2026 FIFA World Cup$/, "")
    .replace(/^Will /, "")
    .replace(/ reach the final of the 2026 FIFA World Cup$/, "")
    .replace(/ reach the semifinals of the 2026 FIFA World Cup$/, "")
    .replace(/ reach the quarterfinals of the 2026 FIFA World Cup$/, "")
    .replace(/ reach the Round of 16 at the 2026 FIFA World Cup$/, "")
    .replace(/\?$/, "")
    .trim();
}

function futureCode(slug: string) {
  if (slug.includes("winner")) return "CUP";
  if (slug.includes("golden-boot")) return "GB";
  if (slug.includes("golden-ball")) return "MVP";
  if (slug.includes("semifinals")) return "SF";
  if (slug.includes("quarterfinals")) return "QF";
  if (slug.includes("final")) return "FIN";
  return "WC";
}

function translateOutcome(label: string) {
  if (label === "Yes") return "YES";
  if (label === "No") return "NO";
  if (label === "Over") return "YES";
  if (label === "Under") return "NO";
  return label;
}

function toJa(value: string) {
  const trimmed = value.trim();
  const nonPlayerName = nameMap[trimmed] ?? countryToJapanese(trimmed);

  if (nonPlayerName !== trimmed) {
    return nonPlayerName;
  }

  return playerNameToJapanese(trimmed);
}

function teamCode(value: string) {
  return value
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 3)
    .toUpperCase();
}

function clampProbability(probability: number) {
  return Math.min(0.9999, Math.max(0.0001, probability));
}

function formatVolumeLabel(volume?: number | string | null) {
  const value = Number(volume ?? 0);

  if (!Number.isFinite(value) || value <= 0) return "取引額 -";
  if (value >= 1_000_000_000) return `取引額 ${roundOneDecimal(value / 1_000_000_000)}Bドル`;
  if (value >= 1_000_000) return `取引額 ${roundOneDecimal(value / 1_000_000)}Mドル`;
  if (value >= 1_000) return `取引額 ${Math.round(value / 1_000)}Kドル`;
  return `取引額 ${Math.round(value)}ドル`;
}

function roundOneDecimal(value: number) {
  const rounded = Math.round(value * 10) / 10;

  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function safeJsonArray(value?: string) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const nameMap: Record<string, string> = {
  Africa: "アフリカ",
  "Africa (CAF)": "アフリカ",
  Europe: "ヨーロッパ",
  "Europe (UEFA)": "ヨーロッパ",
  "South America (CONMEBOL)": "南米",
  "North America (CONCACAF)": "北中米",
  "Asia (AFC)": "アジア",
  "Oceania (OCF)": "オセアニア",
  Other: "その他",
};
