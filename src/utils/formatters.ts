/**
 * 格式化价格显示：保留原始精度，不做舍入
 * - 整数部分加千位分隔符
 * - 小数部分保留原始位数（最多8位）
 * - 不进行任何 rounding
 */
export function formatPrice(price: number, symbol: string = 'ETHUSDT'): string {
  // 对小数值使用 toFixed 避免科学计数法
  const str = price < 0.000001 && price !== 0
    ? price.toFixed(10)
    : String(price);

  const dotIndex = str.indexOf('.');
  if (dotIndex === -1) {
    // 整数 — 加千位分隔符
    return str.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  const intPart = str.substring(0, dotIndex);
  const decPart = str.substring(dotIndex + 1);
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // 去除尾部零
  let cleanedDec = decPart.replace(/0+$/, '');
  // 最多保留 8 位小数（UI 整洁）
  if (cleanedDec.length > 8) cleanedDec = cleanedDec.substring(0, 8);

  return cleanedDec.length > 0 ? `${formattedInt}.${cleanedDec}` : formattedInt;
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
