import { MarketBoard } from "@/components/market-board";
import { AppSidebar } from "@/components/app-sidebar";
import { getFeaturedMarkets, getHomeMarkets, getUpcomingFixtures } from "@/lib/data";
import { isLeagueId } from "@/lib/leagues";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams?: Promise<{
    league?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;

  // リーグを選んでいないときはホーム。リーグをまたいだ注目マーケットを出す。
  const league = isLeagueId(params?.league) ? params.league : null;
  const [{ markets, source }, upcoming] = await Promise.all([
    league ? getHomeMarkets(league) : getFeaturedMarkets(),
    league ? Promise.resolve([]) : getUpcomingFixtures(),
  ]);

  return (
    <div className="app-shell">
      <AppSidebar activeLeague={league} />
      <MarketBoard
        activeLeague={league}
        initialBalance={10000}
        initialPredictionHistory={[]}
        markets={markets}
        marketSource={source}
        upcomingMarkets={upcoming}
      />
    </div>
  );
}
