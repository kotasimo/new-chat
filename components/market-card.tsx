"use client";

import Image from "next/image";
import { useState } from "react";
import { clubColors, matchClubName, neutralOutcomeColor } from "@/lib/club-colors";
import { clubCrests } from "@/lib/crests";
import { fixtureType, parseFixture, type Fixture } from "@/lib/market-type";
import { leagueLabel } from "@/lib/leagues";
import { formatOddsValue, formatProbability, probabilityToOdds } from "@/lib/odds";
import type { Market, Outcome, SelectedPrediction } from "@/lib/types";
import type { CSSProperties } from "react";

type MarketCardProps = {
  market: Market;
  now: number | null;
  selectedOutcomeId?: string;
  onSelect: (prediction: SelectedPrediction) => void;
};

// 選択肢が多い市場は上位だけ出して、残りは畳んでおく。
const COLLAPSED_ROWS = 5;

export function MarketCard({ market, now, selectedOutcomeId, onSelect }: MarketCardProps) {
  const isSelectedMarket = market.outcomes.some((outcome) => outcome.id === selectedOutcomeId);
  const lockState = getLockState(market.lockAt, now);
  const isSelectable = !lockState.locked;
  const fixture = market.category === "match" ? parseFixture(market.title) : null;

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
      <div className="card-head">
        <span className="league-badge">{leagueLabel(market.league)}</span>
        {fixture ? (
          <span className={`type-badge ${fixtureType(fixture.question).tone}`}>
            {fixtureType(fixture.question).label}
          </span>
        ) : null}
        {market.startsAt ? (
          <time className="kickoff" dateTime={market.startsAt}>
            {formatKickoff(market.startsAt)}
          </time>
        ) : null}
        {lockState.label ? (
          <span className={`market-lock ${lockState.locked ? "locked" : ""}`}>
            {lockState.label}
          </span>
        ) : null}
        <span className="market-volume">{market.volumeLabel}</span>
      </div>

      {fixture ? (
        <FixtureMarket
          market={market}
          fixture={fixture}
          locked={lockState.locked}
          selectedOutcomeId={selectedOutcomeId}
          onSelect={onSelect}
        />
      ) : (
        <ListMarket
          market={market}
          locked={lockState.locked}
          selectedOutcomeId={selectedOutcomeId}
          onSelect={onSelect}
        />
      )}
    </article>
  );
}

type FixtureMarketProps = {
  market: Market;
  fixture: Fixture;
  locked: boolean;
  selectedOutcomeId?: string;
  onSelect: (prediction: SelectedPrediction) => void;
};

/** 試合の市場。ホーム・引き分け・アウェイを横に並べる、サッカーでおなじみの形にする。 */
function FixtureMarket({
  market,
  fixture,
  locked,
  selectedOutcomeId,
  onSelect,
}: FixtureMarketProps) {
  const [homeCode, awayCode] = splitCode(market.code);

  return (
    <>
      <div className="fixture">
        <div className="fixture-team">
          <Crest name={fixture.home} code={homeCode} size={30} />
          <strong>{fixture.home}</strong>
        </div>
        <span className="fixture-vs">vs</span>
        <div className="fixture-team away">
          <strong>{fixture.away}</strong>
          <Crest name={fixture.away} code={awayCode} size={30} />
        </div>
      </div>

      <div className="pick-grid" data-count={market.outcomes.length}>
        {market.outcomes.map((outcome, index) => (
          <PickButton
            key={outcome.id}
            market={market}
            outcome={outcome}
            color={fixtureOutcomeColor(outcome.label, index, market.outcomes.length)}
            selected={selectedOutcomeId === outcome.id}
            disabled={locked}
            onSelect={onSelect}
          />
        ))}
      </div>
    </>
  );
}

type ListMarketProps = {
  market: Market;
  locked: boolean;
  selectedOutcomeId?: string;
  onSelect: (prediction: SelectedPrediction) => void;
};

/** 優勝クラブ・得点王のように選択肢が並ぶ市場。 */
function ListMarket({ market, locked, selectedOutcomeId, onSelect }: ListMarketProps) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...market.outcomes].sort((a, b) => b.probability - a.probability);
  const hidden = Math.max(0, sorted.length - COLLAPSED_ROWS);
  const visible = expanded ? sorted : sorted.slice(0, COLLAPSED_ROWS);

  return (
    <>
      <h3>{market.title}</h3>

      <div className="outcome-grid">
        {visible.map((outcome, index) => (
          <OutcomeRow
            key={outcome.id}
            market={market}
            outcome={outcome}
            color={outcomeColor(outcome.label, index, sorted.length)}
            selected={selectedOutcomeId === outcome.id}
            disabled={locked}
            onSelect={onSelect}
          />
        ))}
      </div>

      {hidden > 0 ? (
        <button
          className="more-button"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
        >
          {expanded ? "上位だけ表示 ▴" : `他 ${hidden} 件を見る ▾`}
        </button>
      ) : null}
    </>
  );
}

type PickProps = {
  market: Market;
  outcome: Outcome;
  color: string;
  selected: boolean;
  disabled: boolean;
  onSelect: (prediction: SelectedPrediction) => void;
};

function PickButton({ market, outcome, color, selected, disabled, onSelect }: PickProps) {
  const odds = probabilityToOdds(outcome.probability);

  return (
    <button
      className={`pick-button ${selected ? "selected" : ""}`}
      style={{ "--outcome-color": color } as CSSProperties}
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) return;
        onSelect(toPrediction(market, outcome, odds));
      }}
    >
      <span className="pick-name">{outcome.label}</span>
      <span className="pick-odds">
        <strong>{formatOddsValue(odds)}</strong>
        <small>倍</small>
      </span>
      <span className="pick-probability">{formatProbability(outcome.probability)}</span>
      <span
        className="pick-fill"
        aria-hidden="true"
        style={{ width: `${Math.max(2, Math.round(outcome.probability * 100))}%` }}
      />
    </button>
  );
}

function OutcomeRow({ market, outcome, color, selected, disabled, onSelect }: PickProps) {
  const odds = probabilityToOdds(outcome.probability);

  return (
    <button
      className={`outcome-button ${selected ? "selected" : ""}`}
      style={{ "--outcome-color": color } as CSSProperties}
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) return;
        onSelect(toPrediction(market, outcome, odds));
      }}
    >
      <Crest name={outcome.label} code="" size={22} />
      <strong className="outcome-label">{outcome.label}</strong>
      <span className="outcome-probability">{formatProbability(outcome.probability)}</span>
      <span className="outcome-odds">
        <strong>{formatOddsValue(odds)}</strong>
        <small>倍</small>
      </span>
      <span
        className="outcome-fill"
        aria-hidden="true"
        style={{ width: `${Math.max(2, Math.round(outcome.probability * 100))}%` }}
      />
    </button>
  );
}

/** エンブレムが手元にあれば使い、無いクラブ（J2以下や選手名）は色付きの略号に戻す。 */
function Crest({ name, code, size }: { name: string; code: string; size: number }) {
  const club = matchClubName(name);
  const crest = club ? clubCrests[club] : undefined;

  if (crest) {
    return (
      <Image
        className="crest-image"
        src={crest}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    );
  }

  const color = (club && clubColors[club]) || neutralOutcomeColor;

  // 略号を持たない一覧の行は、丸を空のまま出すより小さな点のほうが収まりがいい。
  if (!code) {
    return <span className="outcome-dot" style={{ background: color }} aria-hidden="true" />;
  }

  return (
    <span
      className="crest"
      style={{ background: color, width: size, height: size }}
      aria-hidden="true"
    >
      {code}
    </span>
  );
}

function toPrediction(market: Market, outcome: Outcome, odds: number): SelectedPrediction {
  return {
    marketId: market.id,
    marketTitle: market.title,
    outcomeId: outcome.id,
    outcomeLabel: outcome.label,
    probability: outcome.probability,
    odds,
    kickoffAt: market.startsAt,
  };
}

/** コードは "CHE-MUN" の形。崩れていてもエンブレムが空にならないようにする。 */
function splitCode(code: string): [string, string] {
  const parts = code.split("-");

  return [parts[0] ?? "", parts[1] ?? ""];
}

function fixtureOutcomeColor(label: string, index: number, count: number) {
  const club = matchClubName(label);
  if (club) return clubColors[club];

  // Yes / No の市場は「起きる」側だけ色を付けて、起きない側は無彩色にする。
  if (count === 2 && index === 0) return "#16a06b";

  return neutralOutcomeColor;
}

// クラブ名が付かない選択肢（選手名など）は、人気順を緑の濃淡で表す。
function outcomeColor(label: string, index: number, count: number) {
  const club = matchClubName(label);
  if (club) return clubColors[club];

  const t = count <= 1 ? 0 : index / (count - 1);

  return `hsl(162 46% ${30 + t * 46}%)`;
}

/** サーバーとブラウザで表示がずれないよう、日本時間に固定する。 */
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
