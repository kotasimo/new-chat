export const playerNameMap: Record<string, string> = {
  "Kylian Mbappe": "エムバペ",
  "Kylian Mbappé": "エムバペ",
  "Erling Haaland": "ハーランド",
  "Lionel Messi": "メッシ",
  "Cristiano Ronaldo": "ロナウド",
  "Harry Kane": "ケイン",
  "Jude Bellingham": "ベリンガム",
  "Lamine Yamal": "ヤマル",
  "Vinicius Jr.": "ヴィニシウス",
  "Vinicius Junior": "ヴィニシウス",
  "Vinícius Júnior": "ヴィニシウス",
  "Jamal Musiala": "ムシアラ",
  "Florian Wirtz": "ヴィルツ",
  "Phil Foden": "フォーデン",
  "Bukayo Saka": "サカ",
  "Rodrygo": "ロドリゴ",
  "Raphinha": "ハフィーニャ",
  "Lautaro Martinez": "ラウタロ",
  "Lautaro Martínez": "ラウタロ",
  "Julian Alvarez": "アルバレス",
  "Julián Álvarez": "アルバレス",
  "Ousmane Dembele": "デンベレ",
  "Ousmane Dembélé": "デンベレ",
  "Mikel Oyarzabal": "オヤルサバル",
  "Michael Olise": "オリーセ",
};

export function playerNameToJapanese(value: string) {
  const trimmed = value.trim();

  return playerNameMap[trimmed] ?? trimmed;
}
