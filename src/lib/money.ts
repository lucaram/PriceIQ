export function roundMoney(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatMoney(symbol: string, n: number) {
  const v = roundMoney(n);
  return `${symbol}${v.toFixed(2)}`;
}
