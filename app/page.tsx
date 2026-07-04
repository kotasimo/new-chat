import { MarketBoard } from "@/components/market-board";
import { AppSidebar } from "@/components/app-sidebar";
import { getHomeMarkets } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const markets = await getHomeMarkets();

  return (
    <div className="app-shell">
      <AppSidebar />
      <MarketBoard
        initialBalance={10000}
        initialPredictionHistory={[]}
        markets={markets}
      />
    </div>
  );
}
