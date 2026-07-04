const JPY_PER_USD = 161;

export function formatUsdVolumeAsYen(volume?: number | string | null) {
  const usd = Number(volume ?? 0);

  if (!Number.isFinite(usd) || usd <= 0) return "取引額 -";

  return `取引額 ${formatYenAmount(usd * JPY_PER_USD)}円`;
}

export function localizeVolumeLabel(label: string) {
  const usd = volumeLabelToUsdValue(label);

  if (usd === null) {
    return label;
  }

  return formatUsdVolumeAsYen(usd);
}

export function volumeLabelToUsdValue(label: string) {
  const dollarMatch = label.match(/([\d.]+)\s*([KMB])?ドル/);

  if (dollarMatch) {
    return scaledValue(dollarMatch[1], dollarMatch[2]);
  }

  const yenMatch = label.match(/約?([\d.]+)\s*([万億兆])?円/);

  if (yenMatch) {
    const yen = scaledYenValue(yenMatch[1], yenMatch[2]);
    return yen === null ? null : yen / JPY_PER_USD;
  }

  return null;
}

function formatYenAmount(value: number) {
  if (value >= 1_000_000_000_000) {
    return `${roundOneDecimal(value / 1_000_000_000_000)}兆`;
  }

  if (value >= 100_000_000) {
    return `${roundOneDecimal(value / 100_000_000)}億`;
  }

  if (value >= 10_000) {
    return `${roundOneDecimal(value / 10_000)}万`;
  }

  return Math.round(value).toLocaleString("ja-JP");
}

function scaledValue(value: string, suffix?: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;

  if (suffix === "B") return number * 1_000_000_000;
  if (suffix === "M") return number * 1_000_000;
  if (suffix === "K") return number * 1_000;

  return number;
}

function scaledYenValue(value: string, suffix?: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;

  if (suffix === "兆") return number * 1_000_000_000_000;
  if (suffix === "億") return number * 100_000_000;
  if (suffix === "万") return number * 10_000;

  return number;
}

function roundOneDecimal(value: number) {
  const rounded = Math.round(value * 10) / 10;

  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
