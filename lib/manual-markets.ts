import { initialMarkets } from "@/lib/mock-markets";

export function getManualMarketRecords() {
  return initialMarkets
    .filter((market) => market.category === "match")
    .map((market, marketIndex) => ({
      market: {
        id: market.id,
        slug: market.slug,
        category: market.category,
        code: market.code,
        title: market.title,
        note: market.note,
        volume_label: market.volumeLabel,
        source: market.source,
        polymarket_slug: market.polymarketSlug ?? null,
        active: true,
        sort_order: (marketIndex + 1) * 10,
        synced_at: new Date().toISOString(),
      },
      outcomes: market.outcomes.map((outcome, outcomeIndex) => ({
        id: outcome.id,
        market_id: market.id,
        label: outcome.label,
        probability: outcome.probability,
        side: outcome.side,
        sort_order: outcomeIndex,
      })),
    }));
}
