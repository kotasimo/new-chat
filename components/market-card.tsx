import { formatOddsValue, formatProbability, probabilityToOdds } from "@/lib/odds";
import type { Market, Outcome, SelectedPrediction } from "@/lib/types";
import type { CSSProperties } from "react";

type MarketCardProps = {
  market: Market;
  now: number | null;
  selectedOutcomeId?: string;
  onSelect: (prediction: SelectedPrediction) => void;
};

export function MarketCard({ market, now, selectedOutcomeId, onSelect }: MarketCardProps) {
  const isSelectedMarket = market.outcomes.some((outcome) => outcome.id === selectedOutcomeId);
  const sortedOutcomes = [...market.outcomes].sort(
    (a, b) => b.probability - a.probability,
  );
  const lockState = getLockState(market.lockAt, now);
  const isSelectable = !lockState.locked;

  // 選択肢が排他で合計が100%前後なら1本の積み上げバーにできる。
  // 「降格するクラブ」のように複数当たる市場は合計が1を大きく超えるので、行ごとのバーにする。
  const total = sortedOutcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
  const isShare = total > 0 && total <= 1.2;

  const rows = sortedOutcomes.map((outcome, index) => ({
    outcome,
    color: outcomeColor(index, sortedOutcomes.length),
    share: total > 0 ? (outcome.probability / total) * 100 : 0,
    lead: isShare && index === 0,
  }));

  return (
    <article
      className={`market-card ${isSelectedMarket && isSelectable ? "selected" : ""} ${
        lockState.locked ? "waiting-result" : ""
      }`}
      onClick={(event) => {
        if (isSelectedMarket) {
          event.stopPropagation();
        }
      }}
    >
      <div className="market-title">
        <div>
          <h3>{market.title}</h3>
          <div className="market-meta-row">
            <span className="market-volume">{market.volumeLabel}</span>
          </div>
        </div>
        {lockState.label ? (
          <span className={`market-lock ${lockState.locked ? "locked" : ""}`}>
            {lockState.label}
          </span>
        ) : null}
      </div>

      {isShare ? (
        <div className="market-stack" aria-hidden="true">
          {rows.map((row) => (
            <span
              key={row.outcome.id}
              style={{ width: `${row.share}%`, background: row.color }}
            />
          ))}
        </div>
      ) : null}

      <div className="outcome-grid">
        {rows.map((row) => (
          <OutcomeButton
            key={row.outcome.id}
            market={market}
            outcome={row.outcome}
            color={row.color}
            showRowBar={!isShare}
            lead={row.lead}
            selected={selectedOutcomeId === row.outcome.id}
            disabled={lockState.locked}
            onSelect={onSelect}
          />
        ))}
      </div>
    </article>
  );
}

type OutcomeButtonProps = {
  market: Market;
  outcome: Outcome;
  color: string;
  showRowBar: boolean;
  lead: boolean;
  selected: boolean;
  disabled: boolean;
  onSelect: (prediction: SelectedPrediction) => void;
};

function OutcomeButton({
  market,
  outcome,
  color,
  showRowBar,
  lead,
  selected,
  disabled,
  onSelect,
}: OutcomeButtonProps) {
  const odds = probabilityToOdds(outcome.probability);

  return (
    <button
      className={`outcome-button ${lead ? "lead" : ""} ${selected ? "selected" : ""}`}
      style={{ "--outcome-color": color } as CSSProperties}
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) return;
        onSelect({
          marketId: market.id,
          marketTitle: market.title,
          outcomeId: outcome.id,
          outcomeLabel: outcome.label,
          probability: outcome.probability,
          odds,
        });
      }}
    >
      <span className="outcome-dot" aria-hidden="true" />
      <strong className="outcome-label">{outcome.label}</strong>
      <span className="outcome-probability">{formatProbability(outcome.probability)}</span>
      <span className="outcome-odds" title={`100pt賭けて当たると${Math.round(odds * 100)}pt戻ります`}>
        <strong>{formatOddsValue(odds)}</strong>
        <small>倍</small>
      </span>
      {showRowBar ? (
        <span className="outcome-meter" aria-hidden="true">
          <span style={{ width: `${Math.max(2, Math.round(outcome.probability * 100))}%` }} />
        </span>
      ) : null}
    </button>
  );
}

// 本命を濃い緑、人気薄を淡い緑にして、色で順位が分かるようにする。
function outcomeColor(index: number, count: number) {
  const t = count <= 1 ? 0 : index / (count - 1);
  const lightness = 30 + t * 46;

  return `hsl(162 46% ${lightness}%)`;
}

function getLockState(lockAt: string | undefined, now: number | null) {
  if (!lockAt || now === null) {
    return { label: "", locked: false };
  }

  const lockTime = new Date(lockAt).getTime();
  if (!Number.isFinite(lockTime)) {
    return { label: "", locked: false };
  }

  const remainingMs = lockTime - now;
  if (remainingMs <= 0) {
    return { label: "結果待ち", locked: true };
  }

  const remainingMinutes = Math.ceil(remainingMs / 60000);

  if (remainingMinutes < 10) {
    return { label: "まもなく締切", locked: false };
  }

  if (remainingMinutes < 60) {
    return { label: `締切まで ${remainingMinutes}分`, locked: false };
  }

  const remainingHours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;

  if (remainingHours < 24) {
    return {
      label: minutes
        ? `締切まで ${remainingHours}時間${minutes}分`
        : `締切まで ${remainingHours}時間`,
      locked: false,
    };
  }

  const days = Math.ceil(remainingHours / 24);
  return { label: `締切まで ${days}日`, locked: false };
}
