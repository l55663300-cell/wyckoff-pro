import { KLine, IndicatorValues } from '../types';

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  let gains = 0, losses = 0;
  for (let i = changes.length - period; i < changes.length; i++) {
    if (changes[i] > 0) gains += changes[i];
    else losses += Math.abs(changes[i]);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calcMACD(closes: number[]): { macd: number; signal: number; hist: number } {
  if (closes.length < 35) return { macd: 0, signal: 0, hist: 0 };
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = calcEMA(macdLine.slice(-9), 9);
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signal[signal.length - 1];
  return { macd: lastMacd, signal: lastSignal, hist: lastMacd - lastSignal };
}

function calcBollinger(closes: number[], period = 20, stdDev = 2): { upper: number; middle: number; lower: number } {
  if (closes.length < period) return { upper: closes[closes.length - 1], middle: closes[closes.length - 1], lower: closes[closes.length - 1] };
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const std = Math.sqrt(variance);
  return { upper: mean + stdDev * std, middle: mean, lower: mean - stdDev * std };
}

function calcATR(klines: KLine[], period = 14): number {
  if (klines.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    const h = klines[i].high, l = klines[i].low, pc = klines[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

function calcADX(klines: KLine[], period = 14): { adx: number; diPlus: number; diMinus: number } {
  if (klines.length < period * 2) return { adx: 20, diPlus: 25, diMinus: 20 };

  const dmPlus: number[] = [], dmMinus: number[] = [], tr: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    const upMove = klines[i].high - klines[i - 1].high;
    const downMove = klines[i - 1].low - klines[i].low;
    dmPlus.push(upMove > downMove && upMove > 0 ? upMove : 0);
    dmMinus.push(downMove > upMove && downMove > 0 ? downMove : 0);
    const h = klines[i].high, l = klines[i].low, pc = klines[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }

  const smoothTR = tr.slice(-period).reduce((a, b) => a + b, 0);
  const smoothDMPlus = dmPlus.slice(-period).reduce((a, b) => a + b, 0);
  const smoothDMMinus = dmMinus.slice(-period).reduce((a, b) => a + b, 0);

  const diPlus = smoothTR > 0 ? (smoothDMPlus / smoothTR) * 100 : 0;
  const diMinus = smoothTR > 0 ? (smoothDMMinus / smoothTR) * 100 : 0;
  const dx = diPlus + diMinus > 0 ? Math.abs(diPlus - diMinus) / (diPlus + diMinus) * 100 : 0;

  return { adx: dx, diPlus, diMinus };
}

export function calcIndicators(klines: KLine[]): IndicatorValues {
  const closes = klines.map((k) => k.close);
  const rsi = calcRSI(closes);
  const { macd, signal: macdSig, hist: macdHist } = calcMACD(closes);
  const bb = calcBollinger(closes);
  const atr = calcATR(klines);
  const { adx, diPlus, diMinus } = calcADX(klines);
  const price = closes[closes.length - 1];

  const rsiState = rsi > 70 ? 'overbought' : rsi < 30 ? 'oversold' : 'neutral';
  const macdState = macdHist > 0 && macd > macdSig ? 'golden' : macdHist < 0 && macd < macdSig ? 'dead' : 'neutral';

  let bbPosition: IndicatorValues['bbPosition'] = 'middle';
  if (price > bb.upper) bbPosition = 'above_upper';
  else if (price > bb.middle + (bb.upper - bb.middle) * 0.7) bbPosition = 'near_upper';
  else if (price < bb.lower) bbPosition = 'below_lower';
  else if (price < bb.middle - (bb.middle - bb.lower) * 0.7) bbPosition = 'near_lower';

  let adxState: IndicatorValues['adxState'] = 'ranging';
  if (adx > 25 && diPlus > diMinus) adxState = 'strong_bull';
  else if (adx > 25 && diMinus > diPlus) adxState = 'strong_bear';
  else if (adx > 20) adxState = 'trending';

  return {
    rsi, rsiState, macd, macdSignal: macdSig, macdHist, macdState,
    bbUpper: bb.upper, bbMiddle: bb.middle, bbLower: bb.lower, bbPosition,
    atr, adx, diPlus, diMinus, adxState,
  };
}
