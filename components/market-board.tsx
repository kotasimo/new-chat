"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MarketCard } from "@/components/market-card";
import { PredictionPanel } from "@/components/prediction-panel";
import { fetchWithAnonymousAuth } from "@/lib/anonymous-auth";
import type {
  Market,
  MarketCategory,
  PredictionHistoryItem,
  SelectedPrediction,
} from "@/lib/types";

const tabs: Array<{ key: "all" | MarketCategory; label: string }> = [
  { key: "all", label: "すべて" },
  { key: "match", label: "勝敗予測" },
  { key: "winner", label: "優勝国" },
  { key: "special", label: "特別予測" },
];

type MarketBoardProps = {
  markets: Market[];
  initialBalance: number;
  initialPredictionHistory: PredictionHistoryItem[];
};

type PeriodicBonusState = {
  amount: number;
  available: boolean;
  nextAvailableAt?: string;
};

export function MarketBoard({
  markets,
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

    return [...searchedMarkets].sort((a, b) => {
      const aWaiting = isWaitingResult(a, now);
      const bWaiting = isWaitingResult(b, now);

      if (aWaiting !== bWaiting) {
        return aWaiting ? -1 : 1;
      }

      return 0;
    });
  }, [activeTab, markets, now, searchQuery]);

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

  async function shareSite(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();

    const shareData = {
      title: "Yosoku Cup",
      text: "世界の予測オッズで、無料で遊ぶ。Yosoku Cup",
      url: window.location.origin,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // Sharing can be cancelled by the user.
      }
      return;
    }

    const shareUrl = new URL("https://twitter.com/intent/tweet");
    shareUrl.searchParams.set("text", shareData.text);
    shareUrl.searchParams.set("url", shareData.url);
    window.open(shareUrl.toString(), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="board-layout" onClick={clearSelectionOnOutsideClick}>
      <main className="main-content">
        <div className="topbar">
          <div className="search-box">
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="マーケットを検索"
              placeholder="マーケットを検索: フランス、得点王、PK戦..."
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
          <div>
            <h1>世界の予測オッズで、無料で遊ぶ。</h1>
            <p>
              Polymarketの予測価格を参考にした、ポイント制の予想ゲーム。
              現金・暗号資産・換金はありません。
            </p>
            <p className="hero-source">
              Polymarketは世界の出来事を取引できる予測市場です。
              <a href="https://polymarket.com" target="_blank" rel="noreferrer">
                polymarket.com
              </a>
            </p>
          </div>
          <div className="hero-actions">
            <button type="button" onClick={shareSite}>
              共有する
            </button>
            <Link className="hero-guide-link" href="/guide">
              遊び方を見る
            </Link>
          </div>
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

        <div className="tabs" role="tablist" aria-label="マーケット種別">
          {tabs.map((tab) => (
            <button
              className={`tab-button ${activeTab === tab.key ? "active" : ""}`}
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="section-head">
          <h2>注目マーケット</h2>
          <span>倍率は予測確率から自動換算</span>
        </div>

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
