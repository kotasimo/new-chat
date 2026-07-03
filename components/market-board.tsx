"use client";

import { Search } from "lucide-react";
import type { MouseEvent } from "react";
import { useMemo, useState } from "react";
import { MarketCard } from "@/components/market-card";
import { PredictionPanel } from "@/components/prediction-panel";
import type {
  Market,
  MarketCategory,
  SelectedPrediction,
} from "@/lib/types";

const tabs: Array<{ key: "all" | MarketCategory; label: string }> = [
  { key: "all", label: "すべて" },
  { key: "match", label: "今日の試合" },
  { key: "winner", label: "優勝国" },
  { key: "special", label: "特別予測" },
];

type MarketBoardProps = {
  markets: Market[];
  initialBalance: number;
};

export function MarketBoard({
  markets,
  initialBalance,
}: MarketBoardProps) {
  const [activeTab, setActiveTab] = useState<"all" | MarketCategory>("all");
  const [selectedPrediction, setSelectedPrediction] = useState<SelectedPrediction | null>(null);
  const [balance, setBalance] = useState(initialBalance);

  const visibleMarkets = useMemo(() => {
    if (activeTab === "all") {
      return markets;
    }

    return markets.filter((market) => market.category === activeTab);
  }, [activeTab, markets]);

  function clearSelectionOnOutsideClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;

    if (target.closest(".side-panel")) {
      return;
    }

    setSelectedPrediction(null);
  }

  return (
    <div className="board-layout" onClick={clearSelectionOnOutsideClick}>
      <main className="main-content">
        <div className="topbar">
          <div className="search-box">
            <Search size={17} aria-hidden="true" />
            <span>マーケットを検索: フランス、得点王、PK戦...</span>
          </div>
          <div className="balance">
            残りポイント <span>{balance.toLocaleString("ja-JP")}</span>pt
          </div>
        </div>

        <section className="hero">
          <div>
            <h1>世界の予測オッズで、無料で遊ぶ。</h1>
            <p>
              Polymarketの予測価格を参考に、難しいYES/NO株ではなく「倍率」と
              「もらえるポイント」で表示。現金・暗号資産・換金はなし。
            </p>
          </div>
        </section>

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
          {visibleMarkets.map((market) => (
            <MarketCard
              key={market.id}
              market={market}
              selectedOutcomeId={selectedPrediction?.outcomeId}
              onSelect={setSelectedPrediction}
            />
          ))}
        </div>
      </main>

      <PredictionPanel
        balance={balance}
        selectedPrediction={selectedPrediction}
        onPredictionCreated={({ nextBalance }) => {
          setBalance(nextBalance);
        }}
      />
    </div>
  );
}
