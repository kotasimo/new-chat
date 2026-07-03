export type MarketCategory = "match" | "winner" | "special";

export type Outcome = {
  id: string;
  label: string;
  probability: number;
  side: "yes" | "no" | "other";
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
};

export type PredictionHistoryItem = {
  id: string;
  marketTitle: string;
  outcomeLabel: string;
  stake: number;
  odds: number;
  status: "open" | "won" | "lost" | "void";
  createdAt: string;
};
