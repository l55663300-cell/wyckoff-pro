/**
 * 根据价格量级决定合理小数位数，消除浮点误差，加千位分隔符
 * - ≥ 10000 (BTC/XAUT)：0 位
 * - ≥ 1000  (BTC 低档/部分山寨)：1 位
 * - ≥ 100   (ETH/BNB/SOL)：2 位
 * - ≥ 10    (中等价位)：3 位
 * - ≥ 1     (XRP/OKB 等)：4 位
 * - ≥ 0.01  ：5 位
 * - ≥ 0.001 ：6 位
 * - < 0.001 ：8 位（SHIB 等极低价）
 */
export function formatPrice(price: number, _symbol: string = ''): string {
  let decimals: number;
  const abs = Math.abs(price);
  if (abs >= 10000)      decimals = 0;
  else if (abs >= 1000)  decimals = 1;
  else if (abs >= 100)   decimals = 2;
  else if (abs >= 10)    decimals = 3;
  else if (abs >= 1)     decimals = 4;
  else if (abs >= 0.01)  decimals = 5;
  else if (abs >= 0.001) decimals = 6;
  else                   decimals = 8;

  // toFixed 消除浮点误差后去尾部零
  const fixed = price.toFixed(decimals);
  const [intPart, decPart = ''] = fixed.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cleanedDec = decPart.replace(/0+$/, '');

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
