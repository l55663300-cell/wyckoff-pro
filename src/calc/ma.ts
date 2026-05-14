import { KLine } from '../types';

/**
 * 计算指数移动平均
 * @param klines K线数组
 * @param period 周期（如20、50）
 * @returns 与 klines 长度相同的 EMA 数组，前 period-1 项用 SMA 初始化
 */
export function calcEMA(klines: KLine[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let sum = 0;
  for (let i = 0; i < period && i < klines.length; i++) {
    sum += klines[i].close;
  }
  if (klines.length < period) return [];
  ema[period - 1] = sum / period;
  for (let i = period; i < klines.length; i++) {
    ema[i] = klines[i].close * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

/**
 * 获取最新 EMA 值
 */
export function getLatestEMA(klines: KLine[], period: number): number {
  const emaArr = calcEMA(klines, period);
  return emaArr.length > 0 ? emaArr[emaArr.length - 1] : klines[klines.length - 1].close;
}
