import { clubToJapanese, normalizeClubName } from "@/lib/clubs";
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

type Teams = {
  home: string;
  away: string;
};

type MatchMarketKind = {
  titleSuffix: string;
  note: string;
  label: (value: string, teams: Teams) => string;
  order: (teams: Teams) => string[];
};

type FutureEventConfig = {
  title: string;
  category: "winner" | "special";
  code: string;
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
const EPL_TAG_ID = "306";
// ほぼ取引されていない選択肢と、0.5のまま置かれている枠を落とすための下限。
const MIN_OUTCOME_VOLUME_USD = 100;
const UNTOUCHED_DEFAULT_VOLUME_USD = 2000;

export async function fetchPolymarketPremierLeagueEvents(limit = 500) {
  const events = await Promise.all([
    fetchGammaEvents(EPL_TAG_ID, limit, false),
    fetchGammaEvents(EPL_TAG_ID, limit, true),
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
      const record = toMatchMarketRecord(event, matchResultKind, 10 + records.length * 10);
      if (record) records.push(record);
      continue;
    }

    const subKind = matchSubEventKind(event);

    if (subKind) {
      const record = toMatchMarketRecord(event, subKind, 300 + records.length * 10);
      if (record) records.push(record);
      continue;
    }

    if (isMoreMarketsEvent(event)) {
      records.push(...toSelectedMoreMarketRecords(event, 200 + records.length * 10));
      continue;
    }

    if (futureEventConfig(event)) {
      const record = toFutureGroupedRecord(event, 500 + records.length * 10);
      if (record) records.push(record);
    }
  }

  return records;
}

// 勝敗・ハーフタイム・先制点は「イベント内の各マーケットが選択肢1つ」という同じ形をしている。
function toMatchMarketRecord(
  event: GammaEvent,
  kind: MatchMarketKind,
  sortOrder: number,
): AppMarketRecord | null {
  const teams = parseMatchTitle(event.title);
  if (!teams) return null;

  const status = eventStatus(event);
  const lockAt = event.endDate ?? null;
  const rawOutcomes = event.markets
    ?.map((market) => {
      const yesPrice = getOutcomePrice(market, "Yes");

      return {
        label: kind.label(market.groupItemTitle || market.question, teams),
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
    kind.order(teams),
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
      code: matchCode(event.slug, teams),
      title: `${toJa(teams.home)} vs ${toJa(teams.away)}: ${kind.titleSuffix}`,
      note: kind.note,
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

  return (event.markets ?? [])
    .map((market, index) => toMatchPropRecord(market, teams, baseSortOrder + index))
    .filter((record): record is AppMarketRecord => record !== null);
}

function toMatchPropRecord(
  market: GammaMarket,
  teams: Teams,
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
      code: matchCode(market.slug, teams),
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
  const config = futureEventConfig(event);
  if (!config) return null;

  const status = eventStatus(event);
  const topMarkets = (event.markets ?? [])
    .map((market) => ({
      market,
      probability: getOutcomePrice(market, "Yes"),
      finalPrice: marketStatus(market, status).closed
        ? getOutcomePrice(market, "Yes")
        : null,
      label: toJa(market.groupItemTitle || extractFutureItem(market.question)),
      placeholder: isPlaceholderMarket(market),
    }))
    .filter((item) => item.probability > 0.001 && item.label && !item.placeholder)
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
      category: config.category,
      code: config.code,
      title: config.title,
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

const matchResultKind: MatchMarketKind = {
  titleSuffix: "試合結果は？",
  note: "勝ち・引き分け・負け",
  label: (value, teams) => {
    if (value.includes("Draw")) return "引き分け";
    if (value.includes(teams.home)) return `${toJa(teams.home)}勝利`;
    if (value.includes(teams.away)) return `${toJa(teams.away)}勝利`;
    return "";
  },
  order: (teams) => [`${toJa(teams.home)}勝利`, "引き分け", `${toJa(teams.away)}勝利`],
};

const halftimeResultKind: MatchMarketKind = {
  titleSuffix: "ハーフタイムでリードしているのは？",
  note: "前半終了時点",
  label: (value, teams) => {
    if (value.includes("Draw")) return "引き分け";
    if (value.includes(teams.home)) return `${toJa(teams.home)}リード`;
    if (value.includes(teams.away)) return `${toJa(teams.away)}リード`;
    return "";
  },
  order: (teams) => [`${toJa(teams.home)}リード`, "引き分け", `${toJa(teams.away)}リード`],
};

const firstTeamToScoreKind: MatchMarketKind = {
  titleSuffix: "先制するのは？",
  note: "無得点のまま終わる場合あり",
  label: (value, teams) => {
    if (value.includes("Neither")) return "どちらも無得点";
    if (value.includes(teams.home)) return toJa(teams.home);
    if (value.includes(teams.away)) return toJa(teams.away);
    return "";
  },
  order: (teams) => [toJa(teams.home), toJa(teams.away), "どちらも無得点"],
};

function matchSubEventKind(event: GammaEvent) {
  if (event.title.endsWith(" - Halftime Result")) return halftimeResultKind;
  if (event.title.endsWith(" - First Team to Score")) return firstTeamToScoreKind;
  return null;
}

function isMainMatchEvent(event: GammaEvent) {
  return (
    /^.+ vs\. .+$/.test(event.title) &&
    !event.title.includes(" - ") &&
    !event.title.includes("H2H")
  );
}

function isMoreMarketsEvent(event: GammaEvent) {
  return /^.+ vs\. .+ - More Markets$/.test(event.title);
}

// シーズン通年のマーケットは取り込むものを絞る。優勝だけはslugに生成時刻が付くので正規表現で拾う。
function futureEventConfig(event: GammaEvent): FutureEventConfig | null {
  if (/^epl-\d{4}-champion/.test(event.slug)) {
    return { title: "優勝クラブは？", category: "winner", code: "EPL" };
  }

  return futureEvents[event.slug] ?? null;
}

const futureEvents: Record<string, FutureEventConfig> = {
  "2027-soccer-premier-league-runner-up": {
    title: "2位になるクラブは？",
    category: "special",
    code: "RU",
  },
  "premier-league-3rd-place-finish-2026-27": {
    title: "3位になるクラブは？",
    category: "special",
    code: "P3",
  },
  "epl-2026-27-top-2-finishers": {
    title: "トップ2に入るクラブは？",
    category: "special",
    code: "TOP2",
  },
  "premier-league-top-4-finishers-2026-27": {
    title: "トップ4に入るクラブは？",
    category: "special",
    code: "TOP4",
  },
  "premier-league-top-5-finishers-2026-27": {
    title: "トップ5に入るクラブは？",
    category: "special",
    code: "TOP5",
  },
  "premier-league-top-6-finishers-2026-27": {
    title: "トップ6に入るクラブは？",
    category: "special",
    code: "TOP6",
  },
  "premier-league-top-10-finishers-2026-27": {
    title: "トップ10に入るクラブは？",
    category: "special",
    code: "TOP10",
  },
  "premier-league-teams-relegated-2026-27": {
    title: "降格するクラブは？",
    category: "special",
    code: "REL",
  },
  "premier-league-last-place-finisher-2026-27": {
    title: "最下位になるクラブは？",
    category: "special",
    code: "LAST",
  },
  "premier-league-17th-place-relegation-survivor-2026-27": {
    title: "17位（残留ライン）になるクラブは？",
    category: "special",
    code: "P17",
  },
  "efl-championship-team-promoted-to-epl-2026-27": {
    title: "プレミアリーグに昇格するクラブは？",
    category: "special",
    code: "PRO",
  },
  "epl-team-to-qualify-for-the-2027-28-uefa-champions-league": {
    title: "チャンピオンズリーグ出場権を取るクラブは？",
    category: "special",
    code: "UCL",
  },
  "epl-team-to-qualify-for-the-2027-28-uefa-europa-league": {
    title: "ヨーロッパリーグ出場権を取るクラブは？",
    category: "special",
    code: "UEL",
  },
  "epl-team-to-qualify-for-the-2027-28-uefa-conference-league": {
    title: "カンファレンスリーグ出場権を取るクラブは？",
    category: "special",
    code: "UECL",
  },
  "premier-league-top-goalscorer-2026-27": {
    title: "得点王は？",
    category: "special",
    code: "GOAL",
  },
  "premier-league-most-assists-2026-27": {
    title: "最多アシストは？",
    category: "special",
    code: "AST",
  },
  "premier-league-most-clean-sheets-2026-27": {
    title: "最多クリーンシートのGKは？",
    category: "special",
    code: "CS",
  },
  "premier-league-team-most-clean-sheets-2026-27": {
    title: "最多クリーンシートのクラブは？",
    category: "special",
    code: "TCS",
  },
};

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
  const match = title.match(/^(.+) vs\. (.+?)(?: - .+)?$/);
  if (!match) return null;

  return { home: match[1], away: match[2] };
}

function matchPropTitle(slug: string, teams: Teams) {
  const prefix = `${toJa(teams.home)} vs ${toJa(teams.away)}`;

  if (/-\d{4}-\d{2}-\d{2}-total-2pt5$/.test(slug)) {
    return `${prefix}: 合計3点以上？`;
  }

  if (/-\d{4}-\d{2}-\d{2}-total-3pt5$/.test(slug)) {
    return `${prefix}: 合計4点以上？`;
  }

  if (/-\d{4}-\d{2}-\d{2}-btts$/.test(slug)) {
    return `${prefix}: 両チーム得点する？`;
  }

  if (/-\d{4}-\d{2}-\d{2}-btts-first-half$/.test(slug)) {
    return `${prefix}: 前半に両チーム得点する？`;
  }

  if (/-\d{4}-\d{2}-\d{2}-first-half-total-0pt5$/.test(slug)) {
    return `${prefix}: 前半に1点以上入る？`;
  }

  if (/-\d{4}-\d{2}-\d{2}-first-half-total-1pt5$/.test(slug)) {
    return `${prefix}: 前半に2点以上入る？`;
  }

  return null;
}

function orderMatchOutcomes(
  outcomes: Array<{ label: string; probability: number; finalPrice?: number | null }>,
  order: string[],
) {
  return outcomes.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
}

function extractFutureItem(question: string) {
  return question
    .replace(/^Will /, "")
    .replace(/ win the \d{4}-\d{2} English Premier League \(EPL\) Championship\?$/, "")
    .replace(/ (be|finish|qualify|score) .*$/, "")
    .replace(/\?$/, "")
    .trim();
}

// Polymarketは枠だけ先に作った Team A / Player AB / Other を0.5のまま混ぜてくる。
// ラベルの付け方はイベントごとに違うので、ほとんど取引されていない選択肢をまとめて落とす。
function isPlaceholderMarket(market: GammaMarket) {
  const label = (market.groupItemTitle || market.question).trim();

  const volume = Number(market.volumeNum ?? market.volume ?? 0);
  const probability = getOutcomePrice(market, "Yes");

  return (
    /^(Team|Player) [A-Z]{1,2}$/.test(label) ||
    volume < MIN_OUTCOME_VOLUME_USD ||
    (Math.abs(probability - 0.5) <= 0.03 && volume < UNTOUCHED_DEFAULT_VOLUME_USD)
  );
}

function toJa(value: string) {
  const trimmed = value.trim();
  const clubName = nameMap[trimmed] ?? clubToJapanese(trimmed);

  if (clubName !== trimmed) {
    return clubName;
  }

  return playerNameToJapanese(trimmed);
}

// 対戦カードのslug (epl-che-mun-2026-10-31...) から検索しやすい短縮コードを作る。
function matchCode(slug: string, teams: Teams) {
  const match = slug.match(/^epl-([a-z]{3})-([a-z]{3})-/);

  if (match) {
    return `${match[1].toUpperCase()}-${match[2].toUpperCase()}`;
  }

  return `${teamCode(teams.home)}-${teamCode(teams.away)}`;
}

function teamCode(value: string) {
  return normalizeClubName(value)
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
  Other: "その他",
  Neither: "どちらも無得点",
  Draw: "引き分け",
};
