export type LeagueId = "epl" | "laliga" | "bundesliga" | "seriea" | "j1" | "ucl";

export type LeagueInfo = {
  id: LeagueId;
  label: string;
  // Polymarketのタグ。セリエAだけ対戦カードとシーズン系でタグが分かれている。
  tagIds: string[];
};

export const leagues: LeagueInfo[] = [
  { id: "epl", label: "プレミアリーグ", tagIds: ["306"] },
  { id: "laliga", label: "ラ・リーガ", tagIds: ["780"] },
  { id: "bundesliga", label: "ブンデスリーガ", tagIds: ["1494"] },
  { id: "seriea", label: "セリエA", tagIds: ["100618", "101962"] },
  { id: "j1", label: "J1リーグ", tagIds: ["102649"] },
  // 1234は大会そのもの。102469は各国リーグからの出場権争いなので使わない。
  { id: "ucl", label: "チャンピオンズリーグ", tagIds: ["1234"] },
];

export const defaultLeague: LeagueId = "epl";

const leagueById = new Map(leagues.map((league) => [league.id, league]));

export function isLeagueId(value: unknown): value is LeagueId {
  return typeof value === "string" && leagueById.has(value as LeagueId);
}

export function toLeagueId(value: unknown): LeagueId {
  return isLeagueId(value) ? value : defaultLeague;
}

export function leagueLabel(id: LeagueId) {
  return leagueById.get(id)?.label ?? id;
}
