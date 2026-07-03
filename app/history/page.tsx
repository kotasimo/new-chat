import { AppSidebar } from "@/components/app-sidebar";
import { getClosedMarkets } from "@/lib/data";
import { formatOdds, probabilityToOdds } from "@/lib/odds";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const markets = await getClosedMarkets();

  return (
    <div className="app-shell">
      <AppSidebar />
      <main className="history-page">
        <header className="history-header">
          <div>
            <h1>終了市場</h1>
            <p>過去に表示されたワールドカップ予測市場と結果。</p>
          </div>
        </header>

        <div className="closed-market-list">
          {markets.length ? (
            markets.map((market) => (
              <article className="closed-market-card" key={market.id}>
                <div className="closed-market-top">
                  <div>
                    <h2>{market.title}</h2>
                    <div className="market-volume">{market.volumeLabel}</div>
                  </div>
                  <time className="closed-time">
                    {market.closedAt ? formatDateTime(market.closedAt) : "終了済み"}
                  </time>
                </div>

                <div className="closed-outcomes">
                  {market.outcomes.map((outcome) => (
                    <span
                      className={`closed-outcome ${outcome.winning ? "winning" : ""}`}
                      key={outcome.id}
                    >
                      <strong>{outcome.label}</strong>
                      <span>{formatOutcomeOdds(outcome.probability, outcome.finalPrice)}</span>
                      <span>
                        {outcome.finalPrice === undefined
                          ? "結果待ち"
                          : outcome.winning
                            ? "的中"
                            : "外れ"}
                      </span>
                    </span>
                  ))}
                </div>
              </article>
            ))
          ) : (
            <p className="empty-text">
              終了市場はまだありません。同期後に closed の市場がここに残ります。
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

function formatOutcomeOdds(probability: number, finalPrice?: number) {
  if (
    finalPrice !== undefined &&
    Math.abs(probability - finalPrice) < 0.00001 &&
    (finalPrice <= 0.0001 || finalPrice >= 0.9999)
  ) {
    return "倍率記録なし";
  }

  return formatOdds(probabilityToOdds(probability));
}
