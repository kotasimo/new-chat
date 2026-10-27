import { MobileFooter } from "@/components/mobile-footer";
import { AccountCard } from "@/components/account-card";
import { AppSidebar } from "@/components/app-sidebar";
import { getClosedMarkets } from "@/lib/data";
import { leagues, toLeagueId } from "@/lib/leagues";
import { formatProbability } from "@/lib/odds";
import { volumeLabelToUsdValue } from "@/lib/volume";
import type { CSSProperties } from "react";

export const dynamic = "force-dynamic";

type HistorySort = "latest" | "volume" | "upset";

const sortOptions: Array<{ key: HistorySort; label: string }> = [
  { key: "latest", label: "新着順" },
  { key: "volume", label: "取引額順" },
  { key: "upset", label: "番狂わせ順" },
];

type HistoryPageProps = {
  searchParams?: Promise<{
    sort?: string;
    league?: string;
  }>;
};

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const params = await searchParams;
  const activeSort = toHistorySort(params?.sort);
  const activeLeague = toLeagueId(params?.league);
  const markets = sortClosedMarkets(
    (await getClosedMarkets(activeLeague, 200)).filter((market) =>
      hasRecordedProbabilities(market),
    ),
    activeSort,
  );

  return (
    <div className="app-shell">
      <AppSidebar />
      <div className="board-layout">
        <main className="history-page">
          <header className="history-header">
            <div>
              <h1>終了市場</h1>
              <p>過去に表示されたプレミアリーグ予測市場と結果。</p>
            </div>
            <nav className="history-sort" aria-label="終了市場の並び替え">
              {sortOptions.map((option) => (
                <a
                  className={`history-sort-button ${
                    activeSort === option.key ? "active" : ""
                  }`}
                  href={`/history?league=${activeLeague}&sort=${option.key}`}
                  key={option.key}
                >
                  {option.label}
                </a>
              ))}
            </nav>
          </header>

          <nav className="tabs league-tabs" aria-label="リーグ">
            {leagues.map((league) => (
              <a
                className={`tab-button ${activeLeague === league.id ? "active" : ""}`}
                href={`/history?league=${league.id}&sort=${activeSort}`}
                key={league.id}
              >
                {league.label}
              </a>
            ))}
          </nav>

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
                    {sortOutcomesForHistory(market.outcomes).map((outcome) => {
                      const probability = outcomeProbability(
                        outcome.probability,
                        outcome.finalPrice,
                      );
                      const strength = probability === null
                        ? 0
                        : Math.max(2, Math.round(probability * 100));

                      return (
                        <div
                          className={`closed-outcome ${outcome.winning ? "is-hit" : ""}`}
                          key={outcome.id}
                          style={{ "--odds-strength": `${strength}%` } as CSSProperties}
                        >
                          <div className="closed-outcome-head">
                            <strong>{outcome.label}</strong>
                          </div>
                          <div className="odds-line">
                            <span className="odds-value">
                              {probability === null
                                ? outcome.winning
                                  ? "結果"
                                  : ""
                                : formatProbability(probability)}
                            </span>
                          </div>
                          <div className="odds-meter" aria-hidden="true">
                            <span />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))
            ) : (
              <p className="empty-text">
                終了市場はまだありません。同期後に closed の市場がここに残ります。
              </p>
            )}
          </div>
          <MobileFooter />
        </main>

        <aside className="side-panel">
          <AccountCard />
          <section className="ticket">
            <h2>予想チケット</h2>
            <div className="selected-box">
              <strong>マーケットを選択</strong>
              <span className="muted">
                予測する画面でマーケットを選ぶと、ここで受け取りポイントを確認できます。
              </span>
            </div>

            <label className="field-label" htmlFor="history-stake">
              使うポイント
            </label>
            <div className="stake-row">
              <input
                className="stake-input"
                id="history-stake"
                readOnly
                type="number"
                value={100}
              />
              <button className="quick-button" disabled type="button">
                最大
              </button>
            </div>

            <div className="return-grid">
              <div>
                <span>倍率</span>
                <strong>-</strong>
              </div>
              <div>
                <span aria-hidden="true">&nbsp;</span>
                <strong>-</strong>
              </div>
            </div>
            <button className="primary-button" disabled type="button">
              この内容で予想する
            </button>
          </section>
        </aside>
      </div>
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

function outcomeProbability(probability: number, finalPrice?: number) {
  if (
    finalPrice !== undefined &&
    Math.abs(probability - finalPrice) < 0.00001 &&
    (finalPrice <= 0.0001 || finalPrice >= 0.9999)
  ) {
    return null;
  }

  return probability;
}

type HistoryOutcome = Awaited<ReturnType<typeof getClosedMarkets>>[number]["outcomes"][number];
type ClosedMarket = Awaited<ReturnType<typeof getClosedMarkets>>[number];

function sortOutcomesForHistory(outcomes: HistoryOutcome[]) {
  return [...outcomes].sort((a, b) => Number(b.winning) - Number(a.winning));
}

function hasRecordedProbabilities(market: ClosedMarket) {
  return market.outcomes.some((outcome) =>
    outcomeProbability(outcome.probability, outcome.finalPrice) !== null,
  );
}

function toHistorySort(value?: string): HistorySort {
  if (value === "volume" || value === "upset") {
    return value;
  }

  return "latest";
}

function sortClosedMarkets(markets: ClosedMarket[], sort: HistorySort) {
  return [...markets].sort((a, b) => {
    if (sort === "volume") {
      return volumeValue(b.volumeLabel) - volumeValue(a.volumeLabel);
    }

    if (sort === "upset") {
      return hitOdds(b) - hitOdds(a);
    }

    return dateValue(b.closedAt) - dateValue(a.closedAt);
  });
}

function hitOdds(market: ClosedMarket) {
  const hit = market.outcomes.find((outcome) => outcome.winning);
  const probability = hit ? outcomeProbability(hit.probability, hit.finalPrice) : null;

  return probability ? 1 / probability : 0;
}

function dateValue(value?: string) {
  return value ? new Date(value).getTime() : 0;
}

function volumeValue(label: string) {
  return volumeLabelToUsdValue(label) ?? 0;
}
