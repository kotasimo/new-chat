"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchWithAnonymousAuth } from "@/lib/anonymous-auth";
import type { BreakdownRow } from "@/lib/my-stats";
import { formatOdds, formatPoints } from "@/lib/odds";

type Prediction = {
  id: string;
  marketTitle: string;
  outcomeLabel: string;
  stake: number;
  odds: number;
  status: "open" | "won" | "lost" | "void";
  payout: number;
  settledAt?: string;
  createdAt: string;
};

type MeResponse = {
  profile: { displayName: string; points: number; createdAt: string | null };
  assets: number;
  lockedPoints: number;
  rank: number;
  totalProfiles: number;
  summary: {
    settled: number;
    won: number;
    staked: number;
    returned: number;
    profit: number;
    roi: number | null;
    hitRate: number | null;
  };
  balanceHistory: Array<{ at: string; balance: number }>;
  breakdowns: { odds: BreakdownRow[]; kind: BreakdownRow[]; league: BreakdownRow[] };
  badges: Array<{ tone: "good" | "bad" | "plain"; text: string }>;
  predictions: Prediction[];
};

type Range = "week" | "month" | "all";

const ranges: Array<{ key: Range; label: string; days: number }> = [
  { key: "week", label: "1週", days: 7 },
  { key: "month", label: "1ヶ月", days: 30 },
  { key: "all", label: "全て", days: 0 },
];

export function MyPage() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState<Range>("month");
  const [tab, setTab] = useState<"open" | "settled">("open");
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const response = await fetchWithAnonymousAuth("/api/me");
        const result = await response.json();

        if (!response.ok) throw new Error(result.error ?? "情報を取得できませんでした。");
        if (!ignore) {
          setLoadedAt(Date.now());
          setData(result);
        }
      } catch (cause) {
        if (!ignore) setError(cause instanceof Error ? cause.message : "情報を取得できませんでした。");
      }
    }

    load();

    return () => {
      ignore = true;
    };
  }, []);

  const open = useMemo(
    () => data?.predictions.filter((p) => p.status === "open") ?? [],
    [data],
  );
  const settled = useMemo(
    () => data?.predictions.filter((p) => p.status !== "open") ?? [],
    [data],
  );

  if (error) {
    return <p className="empty-text">{error}</p>;
  }

  if (!data) {
    return <p className="empty-text">読み込み中...</p>;
  }

  const { summary } = data;
  const shown = tab === "open" ? open : settled;

  return (
    <div className="my-page">
      <section className="my-head">
        <div className="my-card">
          <div className="my-card-top">
            <span className="account-avatar" aria-hidden="true">
              <UserRound size={20} />
            </span>
            <div>
              <strong>{data.profile.displayName}</strong>
              <span>
                {joinedLabel(data.profile.createdAt)}・予想{data.predictions.length}件
              </span>
            </div>
          </div>

          <div className="my-kpis">
            <div className="lead">
              <span>回収率</span>
              <strong className={toneOf(summary.roi, 1)}>{percent(summary.roi)}</strong>
            </div>
            <div>
              <span>的中率</span>
              <strong>{percent(summary.hitRate)}</strong>
            </div>
            <div>
              <span>収支</span>
              <strong className={toneOf(summary.profit, 0)}>{signed(summary.profit)}</strong>
            </div>
          </div>

          <p className="my-rank">
            {data.totalProfiles.toLocaleString("ja-JP")}人中 <strong>{data.rank}位</strong>
          </p>
        </div>

        <div className="my-chart-card">
          <div className="my-chart-head">
            <div>
              <span>保有ポイントの推移</span>
              <strong>{formatPoints(data.profile.points)}</strong>
            </div>
            <div className="my-ranges">
              {ranges.map((item) => (
                <button
                  className={range === item.key ? "active" : ""}
                  key={item.key}
                  type="button"
                  onClick={() => setRange(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <BalanceChart history={data.balanceHistory} days={rangeDays(range)} now={loadedAt} />
        </div>
      </section>

      {data.badges.length ? (
        <div className="my-badges">
          {data.badges.map((badge) => (
            <span className={`my-badge ${badge.tone}`} key={badge.text}>
              {badge.text}
            </span>
          ))}
        </div>
      ) : null}

      {summary.settled ? (
        <section className="my-breakdowns">
          <Breakdown title="倍率帯別" rows={data.breakdowns.odds} />
          <Breakdown title="種類別" rows={data.breakdowns.kind} />
          <Breakdown title="リーグ別" rows={data.breakdowns.league} />
        </section>
      ) : null}

      <section className="my-list">
        <div className="my-tabs" role="tablist" aria-label="予想">
          <button
            aria-selected={tab === "open"}
            className={tab === "open" ? "active" : ""}
            role="tab"
            type="button"
            onClick={() => setTab("open")}
          >
            結果待ち{open.length ? ` ${open.length}` : ""}
          </button>
          <button
            aria-selected={tab === "settled"}
            className={tab === "settled" ? "active" : ""}
            role="tab"
            type="button"
            onClick={() => setTab("settled")}
          >
            決着済み{settled.length ? ` ${settled.length}` : ""}
          </button>
        </div>

        {shown.length ? (
          <div className="settled-list">
            {shown.map((prediction) => (
              <PredictionRow key={prediction.id} prediction={prediction} />
            ))}
          </div>
        ) : (
          <p className="empty-text">
            {tab === "open" ? "結果待ちの予想はありません。" : "決着した予想はありません。"}
            {data.predictions.length ? null : (
              <>
                {" "}
                <Link href="/">マーケットを見る</Link>
              </>
            )}
          </p>
        )}
      </section>
    </div>
  );
}

function PredictionRow({ prediction }: { prediction: Prediction }) {
  const profit = prediction.payout - prediction.stake;
  const open = prediction.status === "open";

  return (
    <article className={`settled-row ${prediction.status}`}>
      <span className="settled-badge">{statusLabel(prediction.status)}</span>
      <div className="settled-main">
        <strong>{prediction.outcomeLabel}</strong>
        <span>{prediction.marketTitle}</span>
      </div>
      <div className="settled-amount">
        <strong>{open ? formatOdds(prediction.odds) : signed(profit)}</strong>
        <span>
          {open
            ? `${formatPoints(prediction.stake)} → 的中なら ${formatPoints(
                prediction.stake * prediction.odds,
              )}`
            : `${formatPoints(prediction.stake)} → ${formatPoints(prediction.payout)}`}
        </span>
      </div>
    </article>
  );
}

function Breakdown({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  if (!rows.length) return null;

  return (
    <section className="breakdown">
      <h3>{title}</h3>
      {rows.map((row) => (
        <div className="breakdown-row" key={row.label}>
          <span className="breakdown-label">{row.label}</span>
          <span className="breakdown-count">
            {row.count}件 {row.won}的中
          </span>
          <strong className={row.roi === null ? "muted" : toneOf(row.roi, 1)}>
            {row.roi === null ? "—" : `${Math.round(row.roi * 100)}%`}
          </strong>
        </div>
      ))}
    </section>
  );
}

/** 折れ線1本なので、描画ライブラリは入れずにSVGで描く。 */
/** 現在時刻は読み込んだ瞬間のものを受け取る。描画のたびに変えない。 */
function BalanceChart({
  history,
  days,
  now,
}: {
  history: Array<{ at: string; balance: number }>;
  days: number;
  now: number;
}) {
  const since = days ? now - days * 86_400_000 : 0;
  const points = now
    ? history.filter((row) => new Date(row.at).getTime() >= since)
    : [];

  if (points.length < 2) {
    return <p className="chart-empty">この期間の記録はまだありません。</p>;
  }

  const values = points.map((row) => row.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 560;
  const height = 120;

  const path = points
    .map((row, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((row.balance - min) / span) * (height - 10) - 5;

      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = values[values.length - 1];
  const first = values[0];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={`${path} L${width},${height} L0,${height} Z`} className="chart-fill" />
        <path d={path} className={`chart-line ${last >= first ? "up" : "down"}`} />
      </svg>
      <div className="chart-scale">
        <span>{formatPoints(max)}</span>
        <span>{formatPoints(min)}</span>
      </div>
    </div>
  );
}

function rangeDays(range: Range) {
  return ranges.find((item) => item.key === range)?.days ?? 0;
}

function statusLabel(status: Prediction["status"]) {
  if (status === "open") return "結果待ち";
  if (status === "won") return "的中";
  if (status === "lost") return "外れ";

  return "無効";
}

function toneOf(value: number | null, threshold: number) {
  if (value === null) return "muted";
  if (value > threshold) return "up";
  if (value < threshold) return "down";

  return "";
}

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function signed(value: number) {
  const rounded = Math.round(value);

  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("ja-JP")}pt`;
}

function joinedLabel(createdAt: string | null) {
  if (!createdAt) return "参加日は不明";

  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return "参加日は不明";

  return `${date.getFullYear()}年${date.getMonth() + 1}月から`;
}
