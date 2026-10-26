"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithAnonymousAuth } from "@/lib/anonymous-auth";
import { formatOdds, formatPoints } from "@/lib/odds";
import type { PredictionHistoryItem, UserProfile } from "@/lib/types";

export function TransactionsBoard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [predictions, setPredictions] = useState<PredictionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadTransactions() {
      try {
        const response = await fetchWithAnonymousAuth("/api/profile");
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "取引履歴を取得できませんでした。");
        }

        if (!ignore) {
          setProfile(result.profile);
          setPredictions(result.predictionHistory);
          setLoading(false);
          setError("");
        }
      } catch (loadError) {
        if (!ignore) {
          setLoading(false);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "取引履歴を取得できませんでした。",
          );
        }
      }
    }

    loadTransactions();

    return () => {
      ignore = true;
    };
  }, []);

  const openPredictions = useMemo(
    () => predictions.filter((prediction) => prediction.status === "open"),
    [predictions],
  );
  const settledPredictions = useMemo(
    () => predictions.filter((prediction) => prediction.status !== "open"),
    [predictions],
  );

  return (
    <div className="board-layout">
      <main className="history-page">
        <header className="history-header">
          <div>
            <h1>取引履歴</h1>
            <p>予想した市場、使ったポイント、予想した瞬間の倍率。</p>
          </div>
        </header>

        {!loading && error ? <p className="empty-text">{error}</p> : null}

        <div className="transaction-columns">
          <section className="transaction-column">
            <h2>結果待ちの予想</h2>
            <TransactionList
              emptyMessage="結果待ちの予想はありません。予測する画面でマーケットを選ぶとここに残ります。"
              loading={loading}
              predictions={openPredictions}
            />
          </section>

          <section className="transaction-column">
            <h2>確定した予想</h2>
            <TransactionList
              emptyMessage="確定した予想はまだありません。結果が確定するとここに移ります。"
              loading={loading}
              predictions={settledPredictions}
            />
          </section>
        </div>
      </main>

      <aside className="side-panel">
        <section className="asset-card">
          <span>保有ポイント</span>
          <strong className={loading ? "loading-value" : ""}>
            {loading ? "—" : profile ? `${profile.points.toLocaleString("ja-JP")}pt` : "-"}
          </strong>
          {!loading && profile?.displayName ? <small>表示名: {profile.displayName}</small> : null}
          {loading ? <small>ゲスト情報を確認しています。</small> : null}
          {!loading && error ? <small>{error}</small> : null}
        </section>

        <section className="ticket">
          <h2>予想チケット</h2>
          <div className="selected-box">
            <strong>マーケットを選択</strong>
            <span className="muted">
              予測する画面でマーケットを選ぶと、ここで受け取りポイントを確認できます。
            </span>
          </div>
        </section>
      </aside>
    </div>
  );
}

function TransactionList({
  emptyMessage,
  loading,
  predictions,
}: {
  emptyMessage: string;
  loading: boolean;
  predictions: PredictionHistoryItem[];
}) {
  if (loading) {
    return <p className="empty-text">読み込み中...</p>;
  }

  if (!predictions.length) {
    return <p className="empty-text">{emptyMessage}</p>;
  }

  return (
    <div className="transaction-list">
      {predictions.map((prediction) => (
        <article className={`transaction-card ${prediction.status}`} key={prediction.id}>
          <div className="transaction-copy">
            <div>
              <strong>{prediction.outcomeLabel}</strong>
              <span>{prediction.marketTitle}</span>
            </div>
          </div>

          <div className="transaction-stats">
            <div>
              <strong>{formatPoints(prediction.stake)}</strong>
            </div>
            <div>
              <strong>{formatOdds(prediction.odds)}</strong>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
