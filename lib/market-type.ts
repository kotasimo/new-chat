import type { Market } from "@/lib/types";

export type Fixture = { home: string; away: string; question: string };

/** "チェルシー vs マンチェスター・U: 試合結果は？" を対戦カードと問いに分ける。 */
export function parseFixture(title: string): Fixture | null {
  const match = title.match(/^(.+?) vs (.+?): (.+)$/);
  if (!match) return null;

  return { home: match[1], away: match[2], question: match[3] };
}

// 同じ対戦カードが何枚も並ぶので、何を当てる市場かはカードの頭で見分けられるようにする。
// 並びもこの順にまとめるため、試合結果を先頭に置いている。
const fixtureTypes: Array<{ match: RegExp; label: string; tone: string }> = [
  { match: /^試合結果/, label: "試合結果", tone: "result" },
  { match: /^先制/, label: "先制点", tone: "first" },
  { match: /^ハーフタイム/, label: "ハーフタイム", tone: "half" },
  { match: /^前半に両チーム/, label: "前半に両チーム得点", tone: "half" },
  { match: /^両チーム/, label: "両チーム得点", tone: "goals" },
];

export function fixtureType(question: string) {
  const found = fixtureTypes.find((type) => type.match.test(question));

  // 知らない問いはそのまま出す。空のラベルより読めるほうがいい。
  return found ?? { label: question.replace(/？$/, ""), tone: "other" };
}

const UNKNOWN_FIXTURE = fixtureTypes.length;
const WINNER = fixtureTypes.length + 1;
const SPECIAL = fixtureTypes.length + 2;

/** 同じ種類をまとめ、試合結果を必ず先頭にするための並び順。小さいほど上。 */
export function marketTypeRank(market: Market) {
  const fixture = market.category === "match" ? parseFixture(market.title) : null;

  if (fixture) {
    const index = fixtureTypes.findIndex((type) => type.match.test(fixture.question));

    return index === -1 ? UNKNOWN_FIXTURE : index;
  }

  return market.category === "winner" ? WINNER : SPECIAL;
}
