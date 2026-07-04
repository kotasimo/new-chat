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
  points: number;
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
