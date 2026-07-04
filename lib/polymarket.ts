import { countryToJapanese } from "@/lib/countries";
import { playerNameToJapanese } from "@/lib/player-names";
import { formatUsdVolumeAsYen } from "@/lib/volume";

type GammaMarket = {
  question: string;
  slug: string;
  groupItemTitle?: string | null;
  outcomePrices?: string;
  outcomes?: string;
  volume?: number | string | null;
  volumeNum?: number | string | null;
  volume24hr?: number | string | null;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  closedTime?: string | null;
};

type GammaEvent = {
  title: string;
  slug: string;
  volume?: number | string | null;
  volume24hr?: number | string | null;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  closedTime?: string | null;
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
    closed: boolean;
    closed_at: string | null;
    starts_at: string | null;
    lock_at: string | null;
    winning_outcome_id: string | null;
    sort_order: number;
    synced_at: string;
  };
  outcomes: Array<{
    id: string;
    market_id: string;
    label: string;
    probability: number;
    final_price: number | null;
    winning: boolean;
    side: "yes" | "no" | "other";
    sort_order: number;
  }>;
};

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const FIFA_WORLD_CUP_TAG_ID = "102232";
const WORLD_CUP_2026_TAG_ID = "102350";

export async function fetchPolymarketWorldCupEvents(limit = 500) {
  const events = await Promise.all([
    fetchGammaEvents(FIFA_WORLD_CUP_TAG_ID, limit, false),
    fetchGammaEvents(WORLD_CUP_2026_TAG_ID, limit, false),
    fetchGammaEvents(FIFA_WORLD_CUP_TAG_ID, limit, true),
    fetchGammaEvents(WORLD_CUP_2026_TAG_ID, limit, true),
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

  for (const event of events) {
    if (isMainMatchEvent(event)) {
      const record = toMatchResultRecord(event, 10 + records.length * 10);
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

  return records;
}

function toMatchResultRecord(event: GammaEvent, sortOrder: number): AppMarketRecord | null {
  const teams = parseMatchTitle(event.title);
  if (!teams) return null;

  const status = eventStatus(event);
  const lockAt = event.endDate ?? null;
  const rawOutcomes = event.markets
    ?.map((market) => {
      const yesPrice = getOutcomePrice(market, "Yes");

      return {
        label: matchResultLabel(market.groupItemTitle || market.question, teams),
        probability: yesPrice,
        finalPrice: marketStatus(market, status).closed
          ? getOutcomePrice(market, "Yes")
          : null,
      };
    })
    .filter(
      (outcome): outcome is { label: string; probability: number; finalPrice: number | null } =>
        outcome !== null && Boolean(outcome.label),
    );

  if (!rawOutcomes || rawOutcomes.length < 2) return null;

  const total = rawOutcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
  const ordered = orderMatchOutcomes(
    rawOutcomes.map((outcome) => ({
      ...outcome,
      probability: total > 0 ? outcome.probability / total : outcome.probability,
    })),
    teams,
  );
  const id = `polymarket-event-${event.slug}`;
  const outcomeRows = ordered.map((outcome, index) => ({
    id: `${id}-${index}`,
    market_id: id,
    label: outcome.label,
    probability: clampProbability(outcome.probability),
    final_price: outcome.finalPrice == null ? null : clampProbability(outcome.finalPrice),
    winning: status.closed && outcome.finalPrice != null && outcome.finalPrice >= 0.999,
    side: outcomeSide(index),
    sort_order: index,
  }));

  return {
    market: {
      id,
      slug: event.slug,
      category: "match",
      code: `${teamCode(teams.home)}-${teamCode(teams.away)}`,
      title: `${toJa(teams.home)} vs ${toJa(teams.away)}: 試合結果は？`,
      note: "試合結果・引き分けあり",
      volume_label: formatVolumeLabel(event.volume),
      source: "polymarket",
      polymarket_slug: event.slug,
      active: true,
      closed: status.closed,
      closed_at: status.closedAt,
      starts_at: lockAt,
      lock_at: lockAt,
      winning_outcome_id: winningOutcomeId(outcomeRows),
      sort_order: sortOrder,
      synced_at: new Date().toISOString(),
    },
    outcomes: outcomeRows,
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

  const propRecords = (event.markets ?? [])
    .map((market, index) =>
      toMatchPropRecord(market, teams, baseSortOrder + index + records.length),
    )
    .filter((record): record is AppMarketRecord => record !== null);

  records.push(...propRecords);

  return records;
}

function toTeamAdvanceRecord(
  market: GammaMarket,
  teams: { home: string; away: string },
  sortOrder: number,
): AppMarketRecord {
  const status = marketStatus(market);
  const lockAt = market.endDate ?? null;
  const outcomes = parseGammaOutcomes(market, status.closed);
  const id = `polymarket-market-${market.slug}`;
  const outcomeRows = outcomes.map((outcome, index) => ({
    id: `${id}-${index}`,
    market_id: id,
    label: toJa(outcome.label),
    probability: clampProbability(outcome.probability),
    final_price: outcome.finalPrice,
    winning: status.closed && outcome.finalPrice !== null && outcome.finalPrice >= 0.999,
    side: outcomeSide(index),
    sort_order: index,
  }));

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
      closed: status.closed,
      closed_at: status.closedAt,
      starts_at: lockAt,
      lock_at: lockAt,
      winning_outcome_id: winningOutcomeId(outcomeRows),
      sort_order: sortOrder,
      synced_at: new Date().toISOString(),
    },
    outcomes: outcomeRows,
  };
}

function toMatchPropRecord(
  market: GammaMarket,
  teams: { home: string; away: string },
  sortOrder: number,
): AppMarketRecord | null {
  const title = matchPropTitle(market.slug, teams);
  if (!title) return null;

  const status = marketStatus(market);
  const lockAt = market.endDate ?? null;
  const outcomes = parseGammaOutcomes(market, status.closed);
  const id = `polymarket-market-${market.slug}`;
  const outcomeRows = outcomes.map((outcome, index) => ({
    id: `${id}-${index}`,
    market_id: id,
    label: toJa(outcome.label),
    probability: clampProbability(outcome.probability),
    final_price: outcome.finalPrice,
    winning: status.closed && outcome.finalPrice !== null && outcome.finalPrice >= 0.999,
    side: outcomeSide(index),
    sort_order: index,
  }));

  if (outcomeRows.length < 2) return null;

  return {
    market: {
      id,
      slug: market.slug,
      category: "match",
      code: `${teamCode(teams.home)}-${teamCode(teams.away)}`,
      title,
      note: "試合関連",
      volume_label: formatVolumeLabel(market.volumeNum ?? market.volume),
      source: "polymarket",
      polymarket_slug: market.slug,
      active: true,
      closed: status.closed,
      closed_at: status.closedAt,
      starts_at: lockAt,
      lock_at: lockAt,
      winning_outcome_id: winningOutcomeId(outcomeRows),
      sort_order: sortOrder,
      synced_at: new Date().toISOString(),
    },
    outcomes: outcomeRows,
  };
}

function toFutureGroupedRecord(event: GammaEvent, sortOrder: number): AppMarketRecord | null {
  const status = eventStatus(event);
  const topMarkets = (event.markets ?? [])
    .map((market) => ({
      market,
      probability: getOutcomePrice(market, "Yes"),
      finalPrice: marketStatus(market, status).closed
        ? getOutcomePrice(market, "Yes")
        : null,
      label: toJa(market.groupItemTitle || extractFutureItem(market.question)),
    }))
    .filter((item) => item.probability > 0.001 && item.label && !item.label.includes("Team "))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 10);

  if (topMarkets.length < 2) return null;

  const id = `polymarket-event-${event.slug}`;
  const outcomeRows = topMarkets.map((item, index) => ({
    id: `${id}-${item.market.slug}`,
    market_id: id,
    label: item.label,
    probability: clampProbability(item.probability),
    final_price: item.finalPrice === null ? null : clampProbability(item.finalPrice),
    winning: status.closed && item.finalPrice !== null && item.finalPrice >= 0.999,
    side: outcomeSide(index),
    sort_order: index,
  }));

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
      closed: status.closed,
      closed_at: status.closedAt,
      starts_at: null,
      lock_at: null,
      winning_outcome_id: winningOutcomeId(outcomeRows),
      sort_order: sortOrder,
      synced_at: new Date().toISOString(),
    },
    outcomes: outcomeRows,
  };
}

function isMainMatchEvent(event: GammaEvent) {
  return (
    /^.+ vs\. .+$/.test(event.title) &&
    !event.title.includes(" - ") &&
    !event.title.includes("H2H") &&
    !event.title.includes("Goal Contributions") &&
    !event.title.includes("Goals") &&
    !event.title.includes(" to Play ")
  );
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

function parseGammaOutcomes(market: GammaMarket, closed = false) {
  const labels = safeJsonArray(market.outcomes);
  const prices = safeJsonArray(market.outcomePrices).map(Number);

  return labels.map((label, index) => ({
    label: String(label),
    probability: Number.isFinite(prices[index]) ? prices[index] : 0,
    finalPrice: closed && Number.isFinite(prices[index])
      ? clampProbability(prices[index])
      : null,
  }));
}

async function fetchGammaEvents(tagId: string, limit: number, closed: boolean) {
  const pageSize = 100;
  const events: GammaEvent[] = [];

  for (let offset = 0; offset < limit; offset += pageSize) {
    const url = new URL("/events", GAMMA_BASE_URL);
    url.searchParams.set("active", "true");
    url.searchParams.set("closed", String(closed));
    url.searchParams.set("limit", String(Math.min(pageSize, limit - offset)));
    url.searchParams.set("offset", String(offset));
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

    const page = (await response.json()) as GammaEvent[];
    events.push(...page);

    if (page.length < pageSize) {
      break;
    }
  }

  return events;
}

function getOutcomePrice(market: GammaMarket, label: string) {
  return parseGammaOutcomes(market).find((outcome) => outcome.label === label)?.probability ?? 0;
}

function eventStatus(event: GammaEvent) {
  return {
    closed: Boolean(event.closed),
    closedAt: event.closedTime ?? null,
  };
}

function marketStatus(
  market: GammaMarket,
  fallback: { closed: boolean; closedAt: string | null } = { closed: false, closedAt: null },
) {
  const closed = market.closed ?? fallback.closed;

  return {
    closed: Boolean(closed),
    closedAt: closed ? market.closedTime ?? fallback.closedAt : null,
  };
}

function winningOutcomeId(outcomes: Array<{ id: string; winning: boolean }>) {
  return outcomes.find((outcome) => outcome.winning)?.id ?? null;
}

function outcomeSide(index: number): "yes" | "no" | "other" {
  if (index === 0) return "yes";
  if (index === 1) return "no";
  return "other";
}

function parseMatchTitle(title: string) {
  const match = title.match(/^(.+) vs\. (.+)$/);
  if (!match) return null;

  return { home: match[1], away: match[2] };
}

function matchResultLabel(value: string, teams: { home: string; away: string }) {
  if (value.includes("Draw")) return "引き分け";
  if (value.includes(teams.home) || value === teams.home) return `${toJa(teams.home)}勝利`;
  if (value.includes(teams.away) || value === teams.away) return `${toJa(teams.away)}勝利`;
  return "";
}

function matchPropTitle(slug: string, teams: { home: string; away: string }) {
  const prefix = `${toJa(teams.home)} vs ${toJa(teams.away)}`;

  if (/-\d{4}-\d{2}-\d{2}-total-2pt5$/.test(slug)) {
    return `${prefix}: 合計3点以上？`;
  }

  if (/-\d{4}-\d{2}-\d{2}-btts$/.test(slug)) {
    return `${prefix}: 両チーム得点する？`;
  }

  if (/-\d{4}-\d{2}-\d{2}-first-half-total-0pt5$/.test(slug)) {
    return `${prefix}: 前半に1点以上入る？`;
  }

  if (/-\d{4}-\d{2}-\d{2}-penalty-shootout$/.test(slug)) {
    return `${prefix}: PK戦になる？`;
  }

  return null;
}

function orderMatchOutcomes(
  outcomes: Array<{ label: string; probability: number; finalPrice?: number | null }>,
  teams: { home: string; away: string },
) {
  const home = `${toJa(teams.home)}勝利`;
  const away = `${toJa(teams.away)}勝利`;
  const draw = "引き分け";
  const order = [home, draw, away];

  return outcomes.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
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
  return formatUsdVolumeAsYen(volume);
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
