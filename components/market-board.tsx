"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MarketCard } from "@/components/market-card";
import { PredictionPanel } from "@/components/prediction-panel";
import { fetchWithAnonymousAuth } from "@/lib/anonymous-auth";
import type { MarketSource } from "@/lib/data";
import { leagues, type LeagueId } from "@/lib/leagues";
import { marketTypeRank } from "@/lib/market-type";
import type {
  Market,
  MarketCategory,
  PredictionHistoryItem,
  SelectedPrediction,
} from "@/lib/types";

const tabs: Array<{ key: "all" | MarketCategory; label: string }> = [
  { key: "all", label: "すべて" },
  { key: "match", label: "勝敗予測" },
  { key: "winner", label: "優勝クラブ" },
  { key: "special", label: "特別予測" },
];

type MarketBoardProps = {
  activeLeague: LeagueId;
  markets: Market[];
  marketSource: MarketSource;
  initialBalance: number;
  initialPredictionHistory: PredictionHistoryItem[];
};

type PeriodicBonusState = {
  amount: number;
  available: boolean;
  nextAvailableAt?: string;
};

export function MarketBoard({
  activeLeague,
  markets,
  marketSource,
  initialBalance,
  initialPredictionHistory,
}: MarketBoardProps) {
  const [activeTab, setActiveTab] = useState<"all" | MarketCategory>("all");
  const [selectedPrediction, setSelectedPrediction] = useState<SelectedPrediction | null>(null);
  const [balance, setBalance] = useState(initialBalance);
  const [predictionHistory, setPredictionHistory] = useState(initialPredictionHistory);
  const [guestLoading, setGuestLoading] = useState(true);
  const [guestReady, setGuestReady] = useState(false);
  const [guestError, setGuestError] = useState("");
  const [panelNotice, setPanelNotice] = useState("");
  const [periodicBonus, setPeriodicBonus] = useState<PeriodicBonusState | null>(null);
  const [claimingBonus, setClaimingBonus] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadGuestProfile() {
      try {
        const response = await fetchWithAnonymousAuth("/api/profile");
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "ゲスト情報を取得できませんでした。");
        }

        if (!ignore) {
          setBalance(result.profile.points);
          setPredictionHistory(result.predictionHistory.slice(0, 8));
          setPeriodicBonus({
            amount: Number(result.periodicBonus?.amount ?? 1000),
            available: Boolean(result.periodicBonus?.available),
            nextAvailableAt: result.periodicBonus?.nextAvailableAt,
          });
          setGuestLoading(false);
          setGuestReady(true);
          setGuestError("");
        }
      } catch (error) {
        if (!ignore) {
          setGuestLoading(false);
          setGuestReady(false);
          setGuestError(
            error instanceof Error ? error.message : "ゲスト情報を取得できませんでした。",
          );
        }
      }
    }

    loadGuestProfile();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    function openSearch() {
      setMobileSearchOpen(true);
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    }

    window.addEventListener("yosoku:open-search", openSearch);
    return () => window.removeEventListener("yosoku:open-search", openSearch);
  }, []);

  const visibleMarkets = useMemo(() => {
    const filteredMarkets = activeTab === "all"
      ? markets
      : markets.filter((market) => market.category === activeTab);
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const searchedMarkets = normalizedQuery
      ? filteredMarkets.filter((market) => {
        const searchableText = [
          market.title,
          market.note,
          market.code,
          market.volumeLabel,
          ...market.outcomes.map((outcome) => outcome.label),
        ].join(" ").toLowerCase();

        return searchableText.includes(normalizedQuery);
      })
      : filteredMarkets;

    // 同じ種類をまとめて、試合結果を先頭に置く。結果待ちはその種類の中で先に出す。
    return [...searchedMarkets].sort((a, b) => {
      const byType = marketTypeRank(a) - marketTypeRank(b);
      if (byType !== 0) {
        return byType;
      }

      const aWaiting = isWaitingResult(a, now);
      const bWaiting = isWaitingResult(b, now);

      if (aWaiting !== bWaiting) {
        return aWaiting ? -1 : 1;
      }

      return 0;
    });
  }, [activeTab, markets, now, searchQuery]);
  const lastSyncedAt = useMemo(() => {
    const latest = markets.reduce((max, market) => {
      if (!market.syncedAt) return max;

      const time = new Date(market.syncedAt).getTime();
      return Number.isFinite(time) && time > max ? time : max;
    }, 0);

    return latest ? new Date(latest).toISOString() : "";
  }, [markets]);

  function clearSelectionOnOutsideClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;

    if (target.closest(".side-panel")) {
      return;
    }

    setSelectedPrediction(null);
  }

  async function claimPeriodicBonus() {
    if (!periodicBonus?.available || claimingBonus) return;

    setClaimingBonus(true);

    try {
      const response = await fetchWithAnonymousAuth("/api/profile/bonus", {
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "ポイントを受け取れませんでした。");
      }

      setBalance(result.profile.points);
      window.dispatchEvent(new CustomEvent("yosoku:points-updated", {
        detail: { points: result.profile.points },
      }));
      setPeriodicBonus({
        amount: Number(result.periodicBonus?.amount ?? periodicBonus.amount),
        available: Boolean(result.periodicBonus?.available),
        nextAvailableAt: result.periodicBonus?.nextAvailableAt,
      });

      if (result.periodicBonus?.granted) {
        const bonusAmount = Number(result.periodicBonus.amount ?? periodicBonus.amount);
        setPanelNotice(`${bonusAmount.toLocaleString("ja-JP")}ptを受け取りました`);
      } else {
        setPanelNotice("この時間のポイントは受け取り済みです");
      }
    } catch (error) {
      setPanelNotice(
        error instanceof Error ? error.message : "ポイントを受け取れませんでした。",
      );
    } finally {
      setClaimingBonus(false);
    }
  }

  return (
    <div className="board-layout" onClick={clearSelectionOnOutsideClick}>
      <main className="main-content">
        <div className="topbar">
          <div className="search-box">
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="マーケットを検索"
              placeholder="マーケットを検索: アーセナル、得点王、降格..."
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>

        <div className={`mobile-search-panel ${mobileSearchOpen ? "open" : ""}`}>
          <Search size={17} aria-hidden="true" />
          <input
            ref={searchInputRef}
            aria-label="マーケットを検索"
            placeholder="マーケットを検索"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <button
            aria-label="検索を閉じる"
            type="button"
            onClick={() => setMobileSearchOpen(false)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <section className="hero">
          <p>
            <strong>無料ポイントの予想ゲーム。</strong>
            現金・暗号資産・換金はありません。倍率は
            <a href="https://polymarket.com" target="_blank" rel="noreferrer">
              polymarket.com
            </a>
            の予測価格から自動換算しています。
          </p>
          <Link className="hero-guide-link" href="/guide">
            遊び方 →
          </Link>
        </section>

        {periodicBonus?.available ? (
          <section className="bonus-card">
            <div>
              <strong>
                {periodicBonus.amount.toLocaleString("ja-JP")}pt 支給中
              </strong>
              <span>1時間に1回、毎時00分から受け取れます。</span>
            </div>
            <button
              disabled={claimingBonus}
              type="button"
              onClick={claimPeriodicBonus}
            >
              {claimingBonus ? "受け取り中..." : "受け取る"}
            </button>
          </section>
        ) : null}

        <div className="tab-row">
          <nav className="tabs league-tabs" aria-label="リーグ">
            {leagues.map((league) => (
              <Link
                className={`tab-button ${activeLeague === league.id ? "active" : ""}`}
                href={`/?league=${league.id}`}
                key={league.id}
              >
                {league.label}
              </Link>
            ))}
          </nav>

          <select
            aria-label="マーケット種別"
            className={`category-select ${activeTab === "all" ? "" : "active"}`}
            value={activeTab}
            onChange={(event) => setActiveTab(event.target.value as "all" | MarketCategory)}
          >
            {tabs.map((tab) => (
              <option key={tab.key} value={tab.key}>
                {tab.label}
              </option>
            ))}
          </select>
        </div>

        <div className="section-head">
          <h2>注目マーケット</h2>
          <div>
            <span>倍率は予測確率から自動換算</span>
            {lastSyncedAt ? (
              <time dateTime={lastSyncedAt}>
                最終同期 {formatSyncTime(lastSyncedAt)}
              </time>
            ) : null}
          </div>
        </div>

        {marketSource === "sample" ? (
          <p className="data-notice">
            <strong>サンプル表示中。</strong>
            Supabaseが設定されていないため、動作確認用のマーケットを出しています。
            実際のマーケットは出ていません。
          </p>
        ) : null}

        {marketSource === "error" ? (
          <p className="data-notice error">
            <strong>マーケットを読み込めませんでした。</strong>
            しばらくしてから再読み込みしてください。
          </p>
        ) : null}

        <div className="market-list">
          {visibleMarkets.length ? visibleMarkets.map((market) => (
            <MarketCard
              key={market.id}
              market={market}
              now={now}
              selectedOutcomeId={selectedPrediction?.outcomeId}
              onSelect={setSelectedPrediction}
            />
          )) : (
            <p className="empty-text">一致するマーケットはありません。</p>
          )}
        </div>
      </main>

      <PredictionPanel
        balance={balance}
        guestError={guestError}
        guestLoading={guestLoading}
        guestReady={guestReady}
        predictionHistory={predictionHistory}
        selectedPrediction={selectedPrediction}
        notice={panelNotice}
        onClearSelection={() => setSelectedPrediction(null)}
        onNoticeShown={() => setPanelNotice("")}
        onPredictionCreated={({ nextBalance, prediction }) => {
          setBalance(nextBalance);
          setPredictionHistory((history) => [prediction, ...history].slice(0, 8));
        }}
      />
    </div>
  );
}

function isWaitingResult(market: Market, now: number | null) {
  if (!market.lockAt || now === null) {
    return false;
  }

  const lockTime = new Date(market.lockAt).getTime();
  return Number.isFinite(lockTime) && lockTime <= now;
}

function formatSyncTime(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
