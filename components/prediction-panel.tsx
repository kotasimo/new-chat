"use client";

import { AccountCard } from "@/components/account-card";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { fetchWithAnonymousAuth } from "@/lib/anonymous-auth";
import { formatOdds, formatPoints } from "@/lib/odds";
import type { PredictionHistoryItem, SelectedPrediction } from "@/lib/types";

type PredictionPanelProps = {
  balance: number;
  guestError: string;
  guestLoading: boolean;
  guestReady: boolean;
  predictionHistory: PredictionHistoryItem[];
  selectedPrediction: SelectedPrediction | null;
  notice: string;
  onClearSelection: () => void;
  onNoticeShown: () => void;
  onPredictionCreated: (result: {
    nextBalance: number;
    prediction: PredictionHistoryItem;
  }) => void;
};

const stakePresets = [100, 500, 1000];

export function PredictionPanel({
  balance,
  guestError,
  guestLoading,
  guestReady,
  predictionHistory,
  selectedPrediction,
  notice,
  onClearSelection,
  onNoticeShown,
  onPredictionCreated,
}: PredictionPanelProps) {
  const [stakeText, setStakeText] = useState("100");
  const stake = Number(stakeText) || 0;
  const [toast, setToast] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const payout = useMemo(() => {
    if (!selectedPrediction) {
      return 0;
    }

    return stake * selectedPrediction.odds;
  }, [selectedPrediction, stake]);

  useEffect(() => {
    if (!notice) return;

    const timer = window.setTimeout(onNoticeShown, 2200);
    return () => window.clearTimeout(timer);
  }, [notice, onNoticeShown]);

  async function submitPrediction() {
    if (!selectedPrediction || stake < 10 || stake > balance) {
      showToast("マーケットを選んで、10pt以上を入力してください");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetchWithAnonymousAuth("/api/predictions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          marketId: selectedPrediction.marketId,
          outcomeId: selectedPrediction.outcomeId,
          stake,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "予想を保存できませんでした");
      }

      onPredictionCreated({
        nextBalance: result.profile.points,
        prediction: result.prediction,
      });
      showToast(
        `${result.prediction.outcomeLabel} に ${formatPoints(stake)} で予想しました`,
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "予想を保存できませんでした");
    } finally {
      setSubmitting(false);
    }
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  const activeToast = toast || notice;

  return (
    <aside className={`side-panel ${selectedPrediction ? "has-selection" : ""}`}>
      <AccountCard />
      <section className="asset-card">
        <span>保有ポイント</span>
        <strong className={guestLoading ? "loading-value" : ""}>
          {guestLoading ? "—" : `${balance.toLocaleString("ja-JP")}pt`}
        </strong>
        {guestLoading ? <small>ゲスト情報を確認しています。</small> : null}
        {!guestLoading && guestError ? <small>{guestError}</small> : null}
      </section>

      <section className="ticket">
        {selectedPrediction ? (
          <button
            aria-label="選択を解除"
            className="ticket-close"
            type="button"
            onClick={onClearSelection}
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
        <h2>予想チケット</h2>
        <div className={`selected-box ${selectedPrediction ? "filled" : ""}`}>
          {selectedPrediction ? (
            <>
              <strong>{selectedPrediction.outcomeLabel}</strong>
              <span className="muted">
                {selectedPrediction.marketTitle}
                {selectedPrediction.kickoffAt ? (
                  <>
                    <br />
                    {formatKickoff(selectedPrediction.kickoffAt)} キックオフ
                  </>
                ) : null}
              </span>
            </>
          ) : (
            <>
              <strong>マーケットを選択</strong>
              <span className="muted">
                左のマーケットから予想を選ぶと、ここで受け取りポイントを確認できます。
              </span>
            </>
          )}
        </div>

        <label className="field-label" htmlFor="stake">
          使うポイント
        </label>
        <input
          className="stake-input"
          id="stake"
          autoComplete="off"
          inputMode="numeric"
          placeholder="例: 500"
          type="text"
          value={stakeText}
          onChange={(event) => setStakeText(event.target.value.replace(/[^0-9]/g, ""))}
        />
        <div className="stake-chips">
          {stakePresets.map((preset) => (
            <button
              className={`quick-button ${stake === preset ? "active" : ""}`}
              key={preset}
              type="button"
              onClick={() => setStakeText(String(Math.min(preset, balance)))}
            >
              {preset.toLocaleString("ja-JP")}
            </button>
          ))}
          <button className="quick-button" type="button" onClick={() => setStakeText(String(balance))}>
            最大
          </button>
        </div>

        <div className="return-grid">
          <div>
            <span>倍率</span>
            <strong>
              {selectedPrediction ? formatOdds(selectedPrediction.odds) : "-"}
            </strong>
          </div>
          <div>
            <span>的中なら</span>
            <strong>{selectedPrediction ? formatPoints(payout) : "-"}</strong>
          </div>
        </div>
        <button
          className="primary-button"
          data-testid="submit-prediction"
          disabled={submitting || !guestReady}
          type="button"
          onClick={submitPrediction}
        >
          {submitting ? "保存中..." : "この予想を確定する"}
        </button>
      </section>

      <section className="history-card">
        <h2>自分の予想</h2>
        {guestLoading ? (
          <p className="empty-text">読み込み中...</p>
        ) : predictionHistory.length ? (
          <div className="history-list">
            {predictionHistory.map((prediction) => (
              <article className="history-row" key={prediction.id}>
                <strong>{prediction.outcomeLabel}</strong>
                <span>{prediction.marketTitle}</span>
                <div className="history-meta">
                  <span>{formatPoints(prediction.stake)}</span>
                  <span>{formatOdds(prediction.odds)}</span>
                  <small>{statusLabel(prediction)}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-text">まだ予想はありません。</p>
        )}
      </section>

      <div className={`toast ${activeToast ? "show" : ""}`}>{activeToast}</div>
    </aside>
  );
}

/** マーケットカードと同じ見え方にするため、日本時間で揃える。 */
const kickoffFormat = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Tokyo",
});

function formatKickoff(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  return kickoffFormat.format(date);
}

function statusLabel(prediction: PredictionHistoryItem) {
  if (prediction.status === "open") {
    return "結果待ち";
  }

  if (prediction.status === "won") {
    return `的中 +${formatPoints(prediction.payout ?? 0)}`;
  }

  if (prediction.status === "lost") {
    return "外れ";
  }

  return "無効";
}
