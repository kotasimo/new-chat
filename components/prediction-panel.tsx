"use client";

import { useMemo, useState } from "react";
import { formatOdds, formatPoints } from "@/lib/odds";
import type { PredictionHistoryItem, SelectedPrediction } from "@/lib/types";

type PredictionPanelProps = {
  balance: number;
  selectedPrediction: SelectedPrediction | null;
  onPredictionCreated: (result: {
    nextBalance: number;
    prediction: PredictionHistoryItem;
  }) => void;
};

export function PredictionPanel({
  balance,
  selectedPrediction,
  onPredictionCreated,
}: PredictionPanelProps) {
  const [stake, setStake] = useState(100);
  const [toast, setToast] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const payout = useMemo(() => {
    if (!selectedPrediction) {
      return 0;
    }

    return stake * selectedPrediction.odds;
  }, [selectedPrediction, stake]);

  async function submitPrediction() {
    if (!selectedPrediction || stake < 10 || stake > balance) {
      showToast("マーケットを選んで、10pt以上を入力してください");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/predictions", {
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

  return (
    <aside className="side-panel">
      <section className="ticket">
        <h2>予想チケット</h2>
        <div className="selected-box">
          {selectedPrediction ? (
            <>
              <strong>{selectedPrediction.outcomeLabel}</strong>
              <span className="muted">
                {selectedPrediction.marketTitle}
                <br />
                倍率 {formatOdds(selectedPrediction.odds)}
              </span>
            </>
          ) : (
            <>
              <strong>マーケットを選択</strong>
              <span className="muted">
                右のボタンから予想を選ぶと、ここで受け取りポイントを確認できます。
              </span>
            </>
          )}
        </div>

        <label className="field-label" htmlFor="stake">
          使うポイント
        </label>
        <div className="stake-row">
          <input
            className="stake-input"
            id="stake"
            min={10}
            max={balance}
            type="number"
            value={stake}
            onChange={(event) => setStake(Number(event.target.value))}
          />
          <button className="quick-button" type="button" onClick={() => setStake(balance)}>
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
            <span aria-hidden="true">&nbsp;</span>
            <strong>{selectedPrediction ? formatPoints(payout) : "-"}</strong>
          </div>
        </div>
        <button
          className="primary-button"
          data-testid="submit-prediction"
          disabled={submitting}
          type="button"
          onClick={submitPrediction}
        >
          {submitting ? "保存中..." : "この内容で予想する"}
        </button>
      </section>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </aside>
  );
}
