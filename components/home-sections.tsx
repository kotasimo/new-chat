"use client";

import { useMemo, useState } from "react";
import { MarketCard } from "@/components/market-card";
import { leagueLabel, leagues } from "@/lib/leagues";
import { formatPoints } from "@/lib/odds";
import type { Market, PredictionHistoryItem, SelectedPrediction } from "@/lib/types";

type HomeSectionsProps = {
  fixtures: Market[];
  history: PredictionHistoryItem[];
  balance: number;
  rank: number | null;
  loading: boolean;
  now: number | null;
  selectedOutcomeId?: string;
  onSelect: (prediction: SelectedPrediction) => void;
  onFocusFixture: (key: string) => void;
};

/** 日付の区切りは日本時間で揃える。キックオフ表示と同じ基準にするため。 */
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Tokyo",
});

const dayLabelFormat = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  weekday: "short",
  timeZone: "Asia/Tokyo",
});

function dayKey(value: string | undefined) {
  if (!value) return "";

  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? dayKeyFormat.format(date) : "";
}

export function HomeSections({
  fixtures,
  history,
  balance,
  rank,
  loading,
  now,
  selectedOutcomeId,
  onSelect,
  onFocusFixture,
}: HomeSectionsProps) {
  const days = useMemo(() => {
    const byDay = new Map<string, Market[]>();

    for (const fixture of fixtures) {
      const key = dayKey(fixture.startsAt);
      if (!key) continue;

      const list = byDay.get(key);
      if (list) {
        list.push(fixture);
      } else {
        byDay.set(key, [fixture]);
      }
    }

    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, markets]) => ({ key, markets }));
  }, [fixtures]);

  const [activeDay, setActiveDay] = useState<string | null>(null);
  const selectedDay = days.find((day) => day.key === activeDay) ?? days[0];

  const stats = useMemo(() => summarize(history), [history]);

  // 決着した予想を新しい順に数件だけ。開いたときに結果が目に入るようにする。
  const settled = useMemo(
    () =>
      history
        .filter((prediction) => prediction.status !== "open" && prediction.settledAt)
        .sort((a, b) => (a.settledAt ?? "") < (b.settledAt ?? "") ? 1 : -1)
        .slice(0, 4),
    [history],
  );

  return (
    <>
      <section className="my-strip" aria-label="自分の状況">
        <div>
          <span>保有ポイント</span>
          <strong>{loading ? "—" : formatPoints(balance)}</strong>
        </div>
        <div>
          <span>結果待ち</span>
          <strong>{loading ? "—" : `${stats.open}件`}</strong>
        </div>
        <div>
          <span>今日の損益</span>
          <strong className={stats.todayProfit > 0 ? "up" : stats.todayProfit < 0 ? "down" : ""}>
            {loading ? "—" : formatSigned(stats.todayProfit)}
          </strong>
        </div>
        <div>
          <span>順位</span>
          <strong>{loading || rank === null ? "—" : `${rank}位`}</strong>
        </div>
      </section>

      {settled.length ? (
        <section className="settled-section" aria-label="結果が出た予想">
          <div className="section-head">
            <h2>結果が出た予想</h2>
            <div>
              <span>新しい順</span>
            </div>
          </div>
          <div className="settled-list">
            {settled.map((prediction) => {
              const profit = (prediction.payout ?? 0) - prediction.stake;

              return (
                <article
                  className={`settled-row ${prediction.status}`}
                  key={prediction.id}
                >
                  <span className="settled-badge">{resultLabel(prediction.status)}</span>
                  <div className="settled-main">
                    <strong>{prediction.outcomeLabel}</strong>
                    <span>{prediction.marketTitle}</span>
                  </div>
                  <div className="settled-amount">
                    <strong>{formatSigned(profit)}</strong>
                    <span>
                      {formatPoints(prediction.stake)} → {formatPoints(prediction.payout ?? 0)}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {days.length ? (
        <>
          <div className="section-head">
            <h2>試合を予想する</h2>
            <div>
              <span>キックオフが近い順</span>
            </div>
          </div>

          <div className="day-tabs" role="tablist" aria-label="日付">
            {days.map((day) => (
              <button
                aria-selected={day.key === selectedDay?.key}
                className={`day-tab ${day.key === selectedDay?.key ? "active" : ""}`}
                key={day.key}
                role="tab"
                type="button"
                onClick={() => setActiveDay(day.key)}
              >
                <strong>{dayName(day.key)}</strong>
                <small>{day.markets.length}試合</small>
              </button>
            ))}
          </div>

          {selectedDay ? <DayFixtures
            markets={selectedDay.markets}
            now={now}
            selectedOutcomeId={selectedOutcomeId}
            onSelect={onSelect}
            onFocusFixture={onFocusFixture}
          /> : null}
        </>
      ) : null}
    </>
  );
}

type DayFixturesProps = {
  markets: Market[];
  now: number | null;
  selectedOutcomeId?: string;
  onSelect: (prediction: SelectedPrediction) => void;
  onFocusFixture: (key: string) => void;
};

/** その日の試合をリーグごとにまとめて出す。 */
function DayFixtures({
  markets,
  now,
  selectedOutcomeId,
  onSelect,
  onFocusFixture,
}: DayFixturesProps) {
  const grouped = leagues
    .map((league) => ({
      league: league.id,
      markets: markets.filter((market) => market.league === league.id),
    }))
    .filter((group) => group.markets.length > 0);

  return (
    <>
      {grouped.map((group) => (
        <section className="day-group" key={group.league}>
          <h3 className="day-group-head">
            {leagueLabel(group.league)}
            <small>{group.markets.length}試合</small>
          </h3>
          <div className="market-list">
            {group.markets.map((market) => (
              <MarketCard
                key={market.id}
                market={market}
                now={now}
                selectedOutcomeId={selectedOutcomeId}
                onSelect={onSelect}
                onFocusFixture={onFocusFixture}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function summarize(history: PredictionHistoryItem[]) {
  const today = dayKeyFormat.format(new Date());
  let open = 0;
  let todayProfit = 0;

  for (const prediction of history) {
    if (prediction.status === "open") {
      open += 1;
      continue;
    }

    if (!prediction.settledAt || dayKey(prediction.settledAt) !== today) {
      continue;
    }

    todayProfit += (prediction.payout ?? 0) - prediction.stake;
  }

  return { open, todayProfit };
}

function resultLabel(status: PredictionHistoryItem["status"]) {
  if (status === "won") return "的中";
  if (status === "lost") return "外れ";

  return "無効";
}

function formatSigned(value: number) {
  const rounded = Math.round(value);

  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("ja-JP")}pt`;
}

function dayName(key: string) {
  if (key === dayKeyFormat.format(new Date())) return "今日";
  if (key === dayKeyFormat.format(new Date(Date.now() + 86_400_000))) return "明日";

  // 正午を指定するのは、どのタイムゾーンで解釈しても日付がずれないようにするため。
  return dayLabelFormat.format(new Date(`${key}T12:00:00+09:00`));
}
