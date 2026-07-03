import { MarketBoard } from "@/components/market-board";
import { AppSidebar } from "@/components/app-sidebar";
import { getDemoProfile, getHomeMarkets } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [markets, profile] = await Promise.all([
    getHomeMarkets(),
    getDemoProfile(),
  ]);

  return (
    <div className="app-shell">
      <AppSidebar />
      <MarketBoard initialBalance={profile.points} markets={markets} />
    </div>
  );
}
