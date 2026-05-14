import { OIData } from '../types';

/**
 * OI 四象限
 * @returns -1 强空头主导, 0 中性, 1 强多头主导
 */
export function getOIQuadrant(
  priceChange24h: number,
  oiData: OIData | null
): number {
  if (!oiData) return 0;
  const oiChange = oiData.change24h;
  if (priceChange24h > 0.01 && oiChange > 5) return 1;
  if (priceChange24h > 0.01 && oiChange < -5) return -0.5;
  if (priceChange24h < -0.01 && oiChange > 5) return -1;
  if (priceChange24h < -0.01 && oiChange < -5) return 0.5;
  return 0;
}

/**
 * OI 信号文字描述
 */
export function getOISignalText(quadrant: number): string {
  if (quadrant === 1) return '价涨仓增·多头主导';
  if (quadrant === -1) return '价跌仓增·空头主导';
  if (quadrant === 0.5) return '价跌仓减·空头平仓（可能止跌）';
  if (quadrant === -0.5) return '价涨仓减·多头平仓（可能见顶）';
  return 'OI中性';
}
