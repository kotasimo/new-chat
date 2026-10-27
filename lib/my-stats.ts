import type { LeagueId } from "@/lib/leagues";
import { leagueLabel } from "@/lib/leagues";

/** 1件ぶんの決着した予想。集計に必要な分だけ。 */
export type SettledPrediction = {
  stake: number;
  odds: number;
  status: "won" | "lost" | "void";
  payout: number;
  marketTitle: string;
  league: string;
};

export type BreakdownRow = {
  label: string;
  count: number;
  won: number;
  staked: number;
  returned: number;
  /** 回収率。件数が少ないと意味を持たないので、少ないときは null。 */
  roi: number | null;
};

/** 3件に満たない行は回収率を出さない。1件で328%と出ても読み手を誤らせる。 */
const MIN_SAMPLES = 3;

export function summarize(settled: SettledPrediction[]) {
  const staked = settled.reduce((total, p) => total + p.stake, 0);
  const returned = settled.reduce((total, p) => total + p.payout, 0);
  const won = settled.filter((p) => p.status === "won").length;

  return {
    settled: settled.length,
    won,
    staked,
    returned,
    profit: returned - staked,
    roi: staked > 0 ? returned / staked : null,
    hitRate: settled.length > 0 ? won / settled.length : null,
  };
}

function group(settled: SettledPrediction[], keyOf: (p: SettledPrediction) => string) {
  const rows = new Map<string, BreakdownRow>();

  for (const prediction of settled) {
    const label = keyOf(prediction);
    const row = rows.get(label) ?? { label, count: 0, won: 0, staked: 0, returned: 0, roi: null };

    row.count += 1;
    if (prediction.status === "won") row.won += 1;
    row.staked += prediction.stake;
    row.returned += prediction.payout;
    rows.set(label, row);
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      roi: row.count >= MIN_SAMPLES && row.staked > 0 ? row.returned / row.staked : null,
    }))
    .sort((a, b) => b.count - a.count);
}

/** 倍率の帯。本命ばかり買う人か、大穴狙いかが出る。 */
export function oddsBand(odds: number) {
  if (odds < 2) return "本命 〜2.0倍";
  if (odds < 4) return "中穴 2.0〜4.0倍";

  return "大穴 4.0倍〜";
}

/** "チェルシー vs マンU: 試合結果は？" の問いの部分。通期の市場はまとめる。 */
export function marketKind(title: string) {
  const match = title.match(/^.+ vs .+: (.+)$/);

  return match ? match[1] : "シーズン系";
}

export function buildBreakdowns(settled: SettledPrediction[]) {
  return {
    odds: group(settled, (p) => oddsBand(p.odds)),
    kind: group(settled, (p) => marketKind(p.marketTitle)),
    league: group(settled, (p) => leagueLabel(p.league as LeagueId)),
  };
}

/**
 * 集計から「一言」を作る。数字の羅列より、言い切ったほうが自分のことが分かる。
 */
export function buildBadges(
  settled: SettledPrediction[],
  breakdowns: ReturnType<typeof buildBreakdowns>,
) {
  const badges: Array<{ tone: "good" | "bad" | "plain"; text: string }> = [];

  // 直近から数えた連続的中。並び順は新しい順で渡ってくる前提。
  let streak = 0;
  for (const prediction of settled) {
    if (prediction.status !== "won") break;
    streak += 1;
  }
  if (streak >= 2) badges.push({ tone: "good", text: `${streak}連続的中` });

  const scored = [...breakdowns.odds, ...breakdowns.kind].filter((row) => row.roi !== null);
  const best = scored.reduce<BreakdownRow | null>(
    (top, row) => (!top || (row.roi ?? 0) > (top.roi ?? 0) ? row : top),
    null,
  );
  const worst = scored.reduce<BreakdownRow | null>(
    (low, row) => (!low || (row.roi ?? 0) < (low.roi ?? 0) ? row : low),
    null,
  );

  if (best && (best.roi ?? 0) > 1) {
    badges.push({ tone: "good", text: `${best.label}に強い（回収率${Math.round((best.roi ?? 0) * 100)}%）` });
  }
  if (worst && worst !== best && (worst.roi ?? 1) < 1) {
    badges.push({ tone: "bad", text: `${worst.label}は${worst.won}勝${worst.count - worst.won}敗` });
  }

  return badges;
}
