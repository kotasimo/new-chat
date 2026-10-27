import { MobileFooter } from "@/components/mobile-footer";
import { UserRound } from "lucide-react";
import { AccountCard } from "@/components/account-card";
import { AppSidebar } from "@/components/app-sidebar";
import { getRanking } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const ranking = await getRanking(50);

  return (
    <div className="app-shell">
      <AppSidebar />
      <div className="board-layout">
        <main className="history-page">
          <header className="history-header">
            <div>
              <h1>ランキング</h1>
              <p>資産が多い順に表示しています。資産は現金と結果待ちの賭け金の合計です。</p>
            </div>
          </header>

          <div className="ranking-board">
            {ranking.length ? (
              ranking.map((item, index) => (
                <article className="ranking-entry" key={item.id}>
                  <div className="ranking-rank">{index + 1}</div>
                  <span className="ranking-avatar" aria-hidden="true">
                    <UserRound size={17} />
                  </span>
                  <div>
                    <strong>{displayName(item.displayName, item.id)}</strong>
                    <span>ゲストID {item.id.slice(0, 8)}</span>
                  </div>
                  <b>
                    {item.assets.toLocaleString("ja-JP")}pt
                    {item.lockedPoints > 0 ? (
                      <small>
                        投資中 {item.lockedPoints.toLocaleString("ja-JP")}pt
                      </small>
                    ) : null}
                  </b>
                </article>
              ))
            ) : (
              <p className="empty-text">ランキングはまだありません。</p>
            )}
          </div>
          <MobileFooter />
        </main>

        <aside className="side-panel">
          <AccountCard />
          <section className="ticket">
            <h2>ランキングについて</h2>
            <div className="selected-box">
              <strong>資産順</strong>
              <span className="muted">
                資産は現金と結果待ちの賭け金の合計です。予想しても資産は減らず、
                的中すると増え、外れると賭けた分だけ減ります。
              </span>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function displayName(name: string, id: string) {
  return name === "ゲスト" ? `ゲスト ${id.slice(0, 4)}` : name;
}
