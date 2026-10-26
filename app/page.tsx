import { MarketBoard } from "@/components/market-board";
import { AppSidebar } from "@/components/app-sidebar";
import { getHomeMarkets } from "@/lib/data";
import { toLeagueId } from "@/lib/leagues";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams?: Promise<{
    league?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const league = toLeagueId(params?.league);
  const { markets, source } = await getHomeMarkets(league);

  return (
    <div className="app-shell">
      <AppSidebar />
      <MarketBoard
        activeLeague={league}
        initialBalance={10000}
        initialPredictionHistory={[]}
        markets={markets}
        marketSource={source}
      />
    </div>
  );
}
