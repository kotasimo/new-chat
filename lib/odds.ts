export function probabilityToOdds(probability: number, houseFactor = 1) {
  if (probability <= 0) {
    return 1000;
  }

  return Math.max(1.01, houseFactor / probability);
}

export function formatOddsValue(odds: number) {
  return odds.toFixed(odds >= 10 ? 1 : 2);
}

export function formatOdds(odds: number) {
  return `${formatOddsValue(odds)}倍`;
}

export function formatProbability(probability: number) {
  const percentage = probability * 100;
  const rounded = Math.round(percentage * 10) / 10;

  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

export function formatPoints(points: number) {
  return `${Math.round(points).toLocaleString("ja-JP")}pt`;
}
