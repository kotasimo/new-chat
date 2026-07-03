export type CountryInfo = {
  english: string;
  japanese: string;
};

export const countries: CountryInfo[] = [
  { english: "Argentina", japanese: "アルゼンチン" },
  { english: "Austria", japanese: "オーストリア" },
  { english: "Australia", japanese: "オーストラリア" },
  { english: "Belgium", japanese: "ベルギー" },
  { english: "Brazil", japanese: "ブラジル" },
  { english: "Canada", japanese: "カナダ" },
  { english: "Colombia", japanese: "コロンビア" },
  { english: "Croatia", japanese: "クロアチア" },
  { english: "Cabo Verde", japanese: "カーボベルデ" },
  { english: "Cape Verde", japanese: "カーボベルデ" },
  { english: "England", japanese: "イングランド" },
  { english: "Egypt", japanese: "エジプト" },
  { english: "France", japanese: "フランス" },
  { english: "Ghana", japanese: "ガーナ" },
  { english: "Mexico", japanese: "メキシコ" },
  { english: "Morocco", japanese: "モロッコ" },
  { english: "Norway", japanese: "ノルウェー" },
  { english: "Paraguay", japanese: "パラグアイ" },
  { english: "Portugal", japanese: "ポルトガル" },
  { english: "Spain", japanese: "スペイン" },
  { english: "Switzerland", japanese: "スイス" },
  { english: "Algeria", japanese: "アルジェリア" },
  { english: "USA", japanese: "アメリカ" },
  { english: "United States", japanese: "アメリカ" },
];

const englishToCountry = new Map(countries.map((country) => [country.english, country]));

export function countryToJapanese(value: string) {
  const trimmed = value.trim();
  return englishToCountry.get(trimmed)?.japanese ?? trimmed;
}
