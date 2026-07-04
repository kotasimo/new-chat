import { formatOdds, formatProbability, probabilityToOdds } from "@/lib/odds";
import type { Market, Outcome, SelectedPrediction } from "@/lib/types";
import type { CSSProperties } from "react";

type MarketCardProps = {
  market: Market;
  now: number | null;
  selectedOutcomeId?: string;
  onSelect: (prediction: SelectedPrediction) => void;
};

export function MarketCard({ market, now, selectedOutcomeId, onSelect }: MarketCardProps) {
  const isYesNoMarket = market.outcomes.every((outcome) =>
    ["YES", "NO"].includes(outcome.label),
  );
  const isSelectedMarket = market.outcomes.some((outcome) => outcome.id === selectedOutcomeId);
  const sortedOutcomes = [...market.outcomes].sort(
    (a, b) => b.probability - a.probability,
  );
  const lockState = getLockState(market.lockAt, now);
  const isSelectable = !lockState.locked;

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

      <div className="outcome-grid">
        {sortedOutcomes.map((outcome) => (
          <OutcomeButton
            key={outcome.id}
            market={market}
            outcome={outcome}
            binary={isYesNoMarket}
            selected={selectedOutcomeId === outcome.id}
            secondary={isYesNoMarket && outcome.label === "NO"}
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
  binary: boolean;
  selected: boolean;
  secondary: boolean;
  disabled: boolean;
  onSelect: (prediction: SelectedPrediction) => void;
};

function OutcomeButton({
  market,
  outcome,
  binary,
  selected,
  secondary,
  disabled,
  onSelect,
}: OutcomeButtonProps) {
  const odds = probabilityToOdds(outcome.probability);

  return (
    <button
      className={`outcome-button ${binary ? "binary" : ""} ${
        secondary ? "secondary" : ""
      } ${selected ? "selected" : ""}`}
      style={
        {
          "--outcome-strength": `${Math.max(
            2,
            Math.round(outcome.probability * 100),
          )}%`,
        } as CSSProperties
      }
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
      <strong>{outcome.label}</strong>
      <span className="outcome-probability">
        {formatProbability(outcome.probability)}
      </span>
      <span className="outcome-odds">{formatOdds(odds)}</span>
      <span className="outcome-meter" aria-hidden="true">
        <span />
      </span>
    </button>
  );
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
