import { formatOdds, probabilityToOdds } from "@/lib/odds";
import type { Market, Outcome, SelectedPrediction } from "@/lib/types";

type MarketCardProps = {
  market: Market;
  selectedOutcomeId?: string;
  onSelect: (prediction: SelectedPrediction) => void;
};

export function MarketCard({ market, selectedOutcomeId, onSelect }: MarketCardProps) {
  const isYesNoMarket = market.outcomes.every((outcome) =>
    ["YES", "NO"].includes(outcome.label),
  );
  const isSelectedMarket = market.outcomes.some((outcome) => outcome.id === selectedOutcomeId);

  return (
    <article
      className={`market-card ${isSelectedMarket ? "selected" : ""}`}
      onClick={(event) => {
        if (isSelectedMarket) {
          event.stopPropagation();
        }
      }}
    >
      <div className="market-title">
        <div>
          <h3>{market.title}</h3>
          <div className="market-volume">{market.volumeLabel}</div>
        </div>
      </div>

      <div className="outcome-grid">
        {market.outcomes.map((outcome) => (
          <OutcomeButton
            key={outcome.id}
            market={market}
            outcome={outcome}
            binary={isYesNoMarket}
            selected={selectedOutcomeId === outcome.id}
            secondary={isYesNoMarket && outcome.label === "NO"}
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
  onSelect: (prediction: SelectedPrediction) => void;
};

function OutcomeButton({
  market,
  outcome,
  binary,
  selected,
  secondary,
  onSelect,
}: OutcomeButtonProps) {
  const odds = probabilityToOdds(outcome.probability);

  return (
    <button
      className={`outcome-button ${binary ? "binary" : ""} ${
        secondary ? "secondary" : ""
      } ${selected ? "selected" : ""}`}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
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
      <span>{formatOdds(odds)}</span>
    </button>
  );
}
