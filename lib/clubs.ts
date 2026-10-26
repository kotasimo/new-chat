export type ClubInfo = {
  english: string;
  japanese: string;
};

export const clubs: ClubInfo[] = [
  { english: "Arsenal", japanese: "アーセナル" },
  { english: "Aston Villa", japanese: "アストン・ヴィラ" },
  { english: "Bournemouth", japanese: "ボーンマス" },
  { english: "Brentford", japanese: "ブレントフォード" },
  { english: "Brighton", japanese: "ブライトン" },
  { english: "Brighton & Hove Albion", japanese: "ブライトン" },
  { english: "Burnley", japanese: "バーンリー" },
  { english: "Chelsea", japanese: "チェルシー" },
  { english: "Coventry City", japanese: "コヴェントリー" },
  { english: "Crystal Palace", japanese: "クリスタル・パレス" },
  { english: "Everton", japanese: "エヴァートン" },
  { english: "Fulham", japanese: "フラム" },
  { english: "Hull City", japanese: "ハル・シティ" },
  { english: "Ipswich Town", japanese: "イプスウィッチ" },
  { english: "Leeds United", japanese: "リーズ" },
  { english: "Leicester City", japanese: "レスター" },
  { english: "Liverpool", japanese: "リヴァプール" },
  { english: "Luton Town", japanese: "ルートン" },
  { english: "Manchester City", japanese: "マンチェスター・C" },
  { english: "Manchester United", japanese: "マンチェスター・U" },
  { english: "Newcastle United", japanese: "ニューカッスル" },
  { english: "Nottingham Forest", japanese: "ノッティンガム・F" },
  { english: "Sheffield United", japanese: "シェフィールド・U" },
  { english: "Southampton", japanese: "サウサンプトン" },
  { english: "Sunderland", japanese: "サンダーランド" },
  { english: "Tottenham", japanese: "トッテナム" },
  { english: "Tottenham Hotspur", japanese: "トッテナム" },
  { english: "West Ham United", japanese: "ウェストハム" },
  { english: "Wolverhampton Wanderers", japanese: "ウルヴァーハンプトン" },
  // EFL Championship: 昇格マーケットに出てくるクラブ
  { english: "Birmingham City", japanese: "バーミンガム" },
  { english: "Blackburn Rovers", japanese: "ブラックバーン" },
  { english: "Bolton Wanderers", japanese: "ボルトン" },
  { english: "Bristol City", japanese: "ブリストル・C" },
  { english: "Cardiff City", japanese: "カーディフ" },
  { english: "Charlton Athletic", japanese: "チャールトン" },
  { english: "Derby County", japanese: "ダービー" },
  { english: "Middlesbrough", japanese: "ミドルズブラ" },
  { english: "Millwall", japanese: "ミルウォール" },
  { english: "Norwich City", japanese: "ノリッジ" },
  { english: "Oxford United", japanese: "オックスフォード" },
  { english: "Plymouth Argyle", japanese: "プリマス" },
  { english: "Portsmouth", japanese: "ポーツマス" },
  { english: "Preston North End", japanese: "プレストン" },
  { english: "Queens Park Rangers", japanese: "QPR" },
  { english: "Sheffield Wednesday", japanese: "シェフィールド・W" },
  { english: "Stoke City", japanese: "ストーク" },
  { english: "Swansea City", japanese: "スウォンジー" },
  { english: "Watford", japanese: "ワトフォード" },
  { english: "West Bromwich Albion", japanese: "WBA" },
  { english: "Wrexham", japanese: "レクサム" },
];

const englishToClub = new Map(clubs.map((club) => [club.english, club]));

export function clubToJapanese(value: string) {
  const trimmed = value.trim();
  const club = englishToClub.get(trimmed) ?? englishToClub.get(normalizeClubName(trimmed));

  return club?.japanese ?? trimmed;
}

/** Polymarketは "Arsenal FC" や "AFC Bournemouth" のように表記が揺れるので正式名だけ残す。 */
export function normalizeClubName(value: string) {
  return value
    .trim()
    .replace(/^AFC /, "")
    .replace(/ (FC|AFC)$/, "")
    .trim();
}
