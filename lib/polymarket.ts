import { clubToJapanese, normalizeClubName } from "@/lib/clubs";
import type { LeagueId, LeagueInfo } from "@/lib/leagues";
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
  // 日付や勝点のように、クラブ名でも選手名でもない選択肢を持つイベント用。
  label?: (value: string) => string;
};

type AppMarketRecord = {
  market: {
    id: string;
    slug: string;
    league: LeagueId;
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

// リーグは取得元のタグで決まるので、1件ずつ組み立てる間は持たせない。
type DraftMarketRecord = {
  market: Omit<AppMarketRecord["market"], "league">;
  outcomes: AppMarketRecord["outcomes"];
};

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
// ほぼ取引されていない選択肢と、0.5のまま置かれている枠を落とすための下限。
const MIN_OUTCOME_VOLUME_USD = 100;
const UNTOUCHED_DEFAULT_VOLUME_USD = 2000;

export async function fetchPolymarketLeagueEvents(league: LeagueInfo, limit = 300) {
  const events = await Promise.all(
    league.tagIds.flatMap((tagId) => [
      fetchGammaEvents(tagId, limit, false),
      fetchGammaEvents(tagId, limit, true),
    ]),
  );

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

export function buildAppMarketRecordsFromEvents(events: GammaEvent[], league: LeagueId) {
  const records: DraftMarketRecord[] = [];

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

    if (binaryEvents[event.slug]) {
      const record = toBinaryEventRecord(event, 500 + records.length * 10);
      if (record) records.push(record);
      continue;
    }

    if (futureEventConfig(event)) {
      const record = toFutureGroupedRecord(event, 500 + records.length * 10);
      if (record) records.push(record);
    }
  }

  // リーグはイベントではなく取得元のタグで決まるので、組み立てのあとでまとめて付ける。
  return records.map((record) => ({
    ...record,
    market: { ...record.market, league },
  }));
}

// 勝敗・ハーフタイム・先制点は「イベント内の各マーケットが選択肢1つ」という同じ形をしている。
function toMatchMarketRecord(
  event: GammaEvent,
  kind: MatchMarketKind,
  sortOrder: number,
): DraftMarketRecord | null {
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
    .filter((record): record is DraftMarketRecord => record !== null);
}

function toMatchPropRecord(
  market: GammaMarket,
  teams: Teams,
  sortOrder: number,
): DraftMarketRecord | null {
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

function toFutureGroupedRecord(event: GammaEvent, sortOrder: number): DraftMarketRecord | null {
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
      label: futureOutcomeLabel(market, config),
      placeholder: isPlaceholderMarket(market),
    }))
    .filter((item) => item.probability > 0.001 && item.label && !item.placeholder)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 10);

  if (topMarkets.length < 2) return null;

  // 締切つきのイベントは「いつまでに起きるか」なので、確率順ではなく早い締切から並べる。
  if (config.label === deadlineLabel) {
    topMarkets.sort((a, b) => a.probability - b.probability);
  }

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

// 「〜する？」をYes/Noひとつで聞くネタ寄りのイベント。選択肢が分かれていないので別扱いにする。
function toBinaryEventRecord(event: GammaEvent, sortOrder: number): DraftMarketRecord | null {
  const config = binaryEvents[event.slug];
  const market = event.markets?.[0];
  if (!config || !market || isPlaceholderMarket(market)) return null;

  const status = marketStatus(market, eventStatus(event));
  const outcomes = parseGammaOutcomes(market, status.closed);
  const id = `polymarket-event-${event.slug}`;
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
      slug: event.slug,
      category: "special",
      code: config.code,
      title: config.title,
      note: "Polymarketのネタ枠",
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

// シーズン通年のマーケットは、リーグをまたいでslugの形が揃っている。
// 個別に列挙するとリーグとシーズンの数だけ増えるので、形で拾う。
function futureEventConfig(event: GammaEvent): FutureEventConfig | null {
  const slug = event.slug;

  for (const rule of futureEventRules) {
    const match = slug.match(rule.pattern);

    if (match) {
      return rule.config(match, event);
    }
  }

  return null;
}

type FutureEventRule = {
  pattern: RegExp;
  config: (match: RegExpMatchArray, event: GammaEvent) => FutureEventConfig;
};

const futureEventRules: FutureEventRule[] = [
  {
    pattern: /-\d{4}-champion(-\d+)?$/,
    config: () => ({ title: "優勝クラブは？", category: "winner", code: "WIN" }),
  },
  {
    pattern: /-runner-up$/,
    config: () => ({ title: "2位になるクラブは？", category: "special", code: "RU" }),
  },
  {
    pattern: /-3rd-place-finish-/,
    config: () => ({ title: "3位になるクラブは？", category: "special", code: "P3" }),
  },
  {
    pattern: /-top-(\d+)-finishers/,
    config: (match) => ({
      title: `トップ${match[1]}に入るクラブは？`,
      category: "special",
      code: `TOP${match[1]}`,
    }),
  },
  {
    pattern: /-teams-relegated-/,
    config: () => ({ title: "降格するクラブは？", category: "special", code: "REL" }),
  },
  {
    pattern: /-last-place-finisher-/,
    config: () => ({ title: "最下位になるクラブは？", category: "special", code: "LAST" }),
  },
  {
    pattern: /-(\d+)(?:st|nd|rd|th)-place-relegation-survivor-/,
    config: (match) => ({
      title: `${match[1]}位（残留ライン）になるクラブは？`,
      category: "special",
      code: `P${match[1]}`,
    }),
  },
  {
    pattern: /-team-promoted-to-/,
    config: () => ({ title: "昇格してくるクラブは？", category: "special", code: "PRO" }),
  },
  {
    pattern: /-uefa-champions-league$/,
    config: () => ({
      title: "チャンピオンズリーグ出場権を取るクラブは？",
      category: "special",
      code: "UCL",
    }),
  },
  {
    pattern: /-uefa-europa-league$/,
    config: () => ({
      title: "ヨーロッパリーグ出場権を取るクラブは？",
      category: "special",
      code: "UEL",
    }),
  },
  {
    pattern: /-uefa-conference-league$/,
    config: () => ({
      title: "カンファレンスリーグ出場権を取るクラブは？",
      category: "special",
      code: "UECL",
    }),
  },
  {
    pattern: /-top-goalscorer-\d{4}-\d{2}$/,
    config: () => ({ title: "得点王は？", category: "special", code: "GOAL" }),
  },
  {
    pattern: /-most-assists-/,
    config: () => ({ title: "最多アシストは？", category: "special", code: "AST" }),
  },
  {
    pattern: /-team-most-clean-sheets-/,
    config: () => ({
      title: "最多クリーンシートのクラブは？",
      category: "special",
      code: "TCS",
    }),
  },
  {
    pattern: /-most-clean-sheets-/,
    config: () => ({ title: "最多クリーンシートのGKは？", category: "special", code: "CS" }),
  },
  {
    pattern: /-which-manager-gets-sacked-first$/,
    config: () => ({ title: "最初にクビになる監督は？", category: "special", code: "SACK" }),
  },
  {
    pattern: /-out-as-.+-manager-by$/,
    config: (_match, event) => ({
      title: managerExitTitle(event.title),
      category: "special",
      code: "MGROUT",
      label: deadlineLabel,
    }),
  },
  {
    pattern: /-(punishment|verdict)-announced-by$/,
    config: (_match, event) => ({
      title: verdictTitle(event.title),
      category: "special",
      code: "VERDICT",
      label: deadlineLabel,
    }),
  },
  {
    pattern: /^how-many-.+-points-will-(.+)-be-deducted$/,
    config: (match) => ({
      title: `${toJa(slugToName(match[1]))}は勝点を何点剥奪される？`,
      category: "special",
      code: "DEDUCT",
      label: pointsDeductionLabel,
    }),
  },
];

// "Michael Carrick out as Manchester United manager by...?"
function managerExitTitle(title: string) {
  const match = title.match(/^(.+) out as (.+) manager by/);

  if (!match) {
    return "監督が交代するのはいつ？";
  }

  return `${toJa(match[1])}が${toJa(match[2])}の監督を去るのはいつ？`;
}

// "Manchester City punishment announced by...?" / "Barcelona UEFA Negreira verdict announced by...?"
function verdictTitle(title: string) {
  const match = title.match(/^(.+?)(?: UEFA)?(?: Negreira)? (?:punishment|verdict) announced by/);

  if (!match) {
    return "処分が発表されるのはいつ？";
  }

  return `${toJa(match[1])}への処分が発表されるのはいつ？`;
}

// slugの "manchester-city" を "Manchester City" に戻して名前の対応表に渡す。
function slugToName(slug: string) {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Yes/Noひとつで完結するイベント。順位や記録と違って、結果以外の話題で遊べる枠。
const binaryEvents: Record<string, { title: string; code: string }> = {
  "will-theunitedstrand-get-a-haircut-by-2026-27-season-end": {
    title: "TheUnitedStrandは今季中に髪を切る？",
    code: "HAIR",
  },
  "will-manchester-city-be-relegated-from-the-premier-league-in-2026-27": {
    title: "マンチェスター・Cは降格する？",
    code: "MCDOWN",
  },
  "will-manchester-city-be-deducted-premier-league-points-by-june-30-2027": {
    title: "マンチェスター・Cは勝点を剥奪される？",
    code: "MCPEN",
  },
  "will-manchester-city-be-stripped-of-a-premier-league-title-by-june-30-2027": {
    title: "マンチェスター・Cは優勝タイトルを剥奪される？",
    code: "MCTITLE",
  },
  "will-a-transfer-restriction-on-manchester-city-be-applied-by-the-2027-summer-transfer-window": {
    title: "マンチェスター・Cに補強禁止処分が下る？",
    code: "MCBAN",
  },
  "will-manchester-citys-115-charges-verdict-be-overturned-by-june-30-2027": {
    title: "マンチェスター・Cの115件の告発は覆る？",
    code: "MC115",
  },
  "uefa-sanctions-man-city-by-may-30-2027": {
    title: "UEFAはマンチェスター・Cを処分する？",
    code: "MCUEFA",
  },
  "uefa-opens-man-city-investigation-by-may-30-2027": {
    title: "UEFAはマンチェスター・Cの調査を始める？",
    code: "MCPROBE",
  },
  "will-uefa-find-fc-barcelona-guilty-in-the-negreira-case-by-december-31-2027": {
    title: "UEFAはバルセロナをネグレイラ事件で有罪とする？",
    code: "BARNEG",
  },
};

function futureOutcomeLabel(market: GammaMarket, config: FutureEventConfig) {
  const raw = market.groupItemTitle || extractFutureItem(market.question);

  return config.label ? config.label(raw) : toJa(raw);
}

// "Oct 31, 2026" や "October 9" のような締切の選択肢。年は付く時と付かない時がある。
function deadlineLabel(value: string) {
  const match = value.trim().match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  const month = match ? monthNumbers[match[1].slice(0, 3).toLowerCase()] : undefined;

  if (!match || !month) {
    return value;
  }

  const day = Number(match[2]);

  return match[3] ? `${match[3]}年${month}月${day}日まで` : `${month}月${day}日まで`;
}

const monthNumbers: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const pointsDeductionLabels: Record<string, string> = {
  "0": "剥奪なし",
  "1-9": "1〜9点",
  "10-19": "10〜19点",
  "20-29": "20〜29点",
  "30-49": "30〜49点",
  "50+": "50点以上",
  Expelled: "リーグ追放",
};

function pointsDeductionLabel(value: string) {
  return pointsDeductionLabels[value.trim()] ?? value;
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

// 対戦カードのslug (epl-che-mun-2026-10-31..., jap-fag-fct-...) から検索しやすい短縮コードを作る。
function matchCode(slug: string, teams: Teams) {
  const match = slug.match(/^[a-z0-9]+-([a-z]{3})-([a-z]{3})-\d{4}-/);

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
