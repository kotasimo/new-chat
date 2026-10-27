"use client";

import { MobileFooter } from "@/components/mobile-footer";
import { Search, X } from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { HomeSections } from "@/components/home-sections";
import { MarketCard } from "@/components/market-card";
import { PredictionPanel } from "@/components/prediction-panel";
import { fetchWithAnonymousAuth } from "@/lib/anonymous-auth";
import type { MarketSource } from "@/lib/data";
import type { LeagueId } from "@/lib/leagues";
import { fixtureKey, marketTypeRank, parseFixture } from "@/lib/market-type";
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
  activeLeague: LeagueId | null;
  markets: Market[];
  marketSource: MarketSource;
  upcomingMarkets?: Market[];
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
  upcomingMarkets = [],
  initialBalance,
  initialPredictionHistory,
}: MarketBoardProps) {
  const [activeTab, setActiveTab] = useState<"all" | MarketCategory>("all");
  const [selectedPrediction, setSelectedPrediction] = useState<SelectedPrediction | null>(null);
  const [balance, setBalance] = useState(initialBalance);
  const [predictionHistory, setPredictionHistory] = useState(initialPredictionHistory);
  const [fullHistory, setFullHistory] = useState<PredictionHistoryItem[]>([]);
  const [rank, setRank] = useState<number | null>(null);
  const [lockedPoints, setLockedPoints] = useState(0);
  const [guestLoading, setGuestLoading] = useState(true);
  const [guestReady, setGuestReady] = useState(false);
  const [guestError, setGuestError] = useState("");
  const [panelNotice, setPanelNotice] = useState("");
  const [periodicBonus, setPeriodicBonus] = useState<PeriodicBonusState | null>(null);
  const [claimingBonus, setClaimingBonus] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedFixture, setFocusedFixture] = useState<string | null>(null);
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
          setFullHistory(result.predictionHistory);
          setRank(typeof result.rank === "number" ? result.rank : null);
          setLockedPoints(Number(result.lockedPoints) || 0);
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
    // 試合を選んでいるあいだは、その試合のマーケットだけを出す。
    const scopedMarkets = focusedFixture
      ? markets.filter((market) => fixtureKey(market) === focusedFixture)
      : markets;
    const filteredMarkets = focusedFixture || activeTab === "all"
      ? scopedMarkets
      : scopedMarkets.filter((market) => market.category === activeTab);
    const normalizedQuery = focusedFixture ? "" : searchQuery.trim().toLowerCase();
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

    // ホームは出来高の高い順に並べてあるので、種類でまとめ直さない。
    if (!activeLeague && !focusedFixture) {
      return searchedMarkets;
    }

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
  }, [activeLeague, activeTab, focusedFixture, markets, now, searchQuery]);
  const isHome = !activeLeague && !focusedFixture;

  // 絞り込みや検索をしているときは、日付別の試合はしまう。
  const showUpcoming =
    isHome &&
    activeTab === "all" &&
    !searchQuery.trim() &&
    upcomingMarkets.length > 0;

  const focusedTitle = useMemo(() => {
    if (!focusedFixture) return "";

    const market = markets.find((item) => fixtureKey(item) === focusedFixture);
    const fixture = market ? parseFixture(market.title) : null;

    return fixture ? `${fixture.home} vs ${fixture.away}` : "この試合";
  }, [focusedFixture, markets]);

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

        {focusedFixture ? (
          <div className="focus-bar">
            <button type="button" onClick={() => setFocusedFixture(null)}>
              ← すべてのマーケット
            </button>
            <h2>{focusedTitle}</h2>
            <span>{visibleMarkets.length}件</span>
          </div>
        ) : null}

        {isHome ? (
          <HomeSections
            balance={balance}
            fixtures={upcomingMarkets}
            lockedPoints={lockedPoints}
            history={fullHistory}
            loading={guestLoading}
            now={now}
            rank={rank}
            showFixtures={showUpcoming}
            selectedOutcomeId={selectedPrediction?.outcomeId}
            onSelect={setSelectedPrediction}
            onFocusFixture={setFocusedFixture}
          />
        ) : null}

        {activeLeague || focusedFixture ? null : (
          <div className="section-head">
            <h2>注目マーケット</h2>
          </div>
        )}

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
              onFocusFixture={focusedFixture ? undefined : setFocusedFixture}
            />
          )) : (
            <p className="empty-text">一致するマーケットはありません。</p>
          )}
        </div>
        <MobileFooter />
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
          setFullHistory((history) => [prediction, ...history]);
          setLockedPoints((current) => current + prediction.stake);
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

