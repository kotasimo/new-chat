// scripts/fetch-crests.mjs の生成物。手で書き換えないで、スクリプトを実行し直す。
import type { LeagueId } from "@/lib/leagues";

export const leagueLogos: Partial<Record<LeagueId, string>> = {
  epl: "/leagues/epl.png",
  ucl: "/leagues/ucl.png",
  laliga: "/leagues/laliga.png",
  bundesliga: "/leagues/bundesliga.png",
  seriea: "/leagues/seriea.png",
  j1: "/leagues/j1.png",
};
