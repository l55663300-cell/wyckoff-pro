export function formatPrice(price: number, symbol: string = 'ETHUSDT'): string {
  let decimals: number;
  if (symbol === 'BTCUSDT' || symbol === 'XAUTUSDT') decimals = 0;
  else if (symbol === 'XRPUSDT') decimals = 4;
  else if (symbol === 'SOLUSDT' || symbol === 'BNBUSDT') decimals = 2;
  else if (price >= 10000) decimals = 0;
  else if (price >= 100) decimals = 2;
  else if (price >= 1) decimals = 4;
  else decimals = 6;
  return price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPercent(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatVolume(vol: number): string {
  if (vol >= 1e9) return `${(vol / 1e9).toFixed(2)}B`;
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(2)}K`;
  return vol.toFixed(2);
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatFundingRate(rate: number): string {
  return `${(rate * 100).toFixed(4)}%`;
}

export function getFearGreedLabel(value: number): string {
  if (value <= 25) return '极度恐慌';
  if (value <= 45) return '恐慌';
  if (value <= 55) return '中性';
  if (value <= 75) return '贪婪';
  return '极度贪婪';
}

export function getFearGreedColor(value: number): string {
  if (value <= 25) return '#EF5350';
  if (value <= 45) return '#FF7043';
  if (value <= 55) return '#F59E0B';
  if (value <= 75) return '#66BB6A';
  return '#26A69A';
}
