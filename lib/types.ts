import type { LeagueId } from "@/lib/leagues";

export type MarketCategory = "match" | "winner" | "special";

export type Outcome = {
  id: string;
  label: string;
  probability: number;
  side: "yes" | "no" | "other";
  finalPrice?: number;
  winning?: boolean;
};

export type Market = {
  id: string;
  slug: string;
  league: LeagueId;
  category: MarketCategory;
  code: string;
  title: string;
  note: string;
  volumeLabel: string;
  source: "polymarket" | "manual";
  polymarketSlug?: string;
  closed?: boolean;
  closedAt?: string;
  startsAt?: string;
  lockAt?: string;
  syncedAt?: string;
  winningOutcomeId?: string;
  outcomes: Outcome[];
};

export type SelectedPrediction = {
  marketId: string;
  marketTitle: string;
  outcomeId: string;
  outcomeLabel: string;
  probability: number;
  odds: number;
  kickoffAt?: string;
};

export type UserProfile = {
  id: string;
  displayName: string;
  points: number;
  periodicBonusClaimedAt?: string;
};

export type RankingItem = {
  id: string;
  displayName: string;
  /** 現金。賭けたぶんはここから引かれている。 */
  points: number;
  /** 結果待ちの賭け金。 */
  lockedPoints: number;
  /** 現金 + 結果待ち。順位はこれで決まる。 */
  assets: number;
};

export type PredictionHistoryItem = {
  id: string;
  marketTitle: string;
  outcomeLabel: string;
  stake: number;
  odds: number;
  probabilityAtPrediction: number;
  status: "open" | "won" | "lost" | "void";
  payout?: number;
  settledAt?: string;
  createdAt: string;
};
