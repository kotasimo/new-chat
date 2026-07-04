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
              <p>保有ポイントが多い順に表示しています。</p>
            </div>
          </header>

          <div className="ranking-board">
            {ranking.length ? (
              ranking.map((item, index) => (
                <article className="ranking-entry" key={item.id}>
                  <div className="ranking-rank">{index + 1}</div>
                  <div>
                    <strong>{displayName(item.displayName, item.id)}</strong>
                    <span>ゲストID {item.id.slice(0, 8)}</span>
                  </div>
                  <b>{item.points.toLocaleString("ja-JP")}pt</b>
                </article>
              ))
            ) : (
              <p className="empty-text">ランキングはまだありません。</p>
            )}
          </div>
        </main>

        <aside className="side-panel">
          <section className="ticket">
            <h2>ランキングについて</h2>
            <div className="selected-box">
              <strong>保有ポイント順</strong>
              <span className="muted">
                的中すると保有ポイントが増え、外れると投入分が減ります。
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
