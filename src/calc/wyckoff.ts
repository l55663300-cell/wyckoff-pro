import { KLine, WyckoffPhase, WyckoffPattern, WyckoffAnalysis, IndicatorValues } from '../types';

function avgVolume(klines: KLine[], period = 20): number {
  const recent = klines.slice(-period);
  return recent.reduce((a, k) => a + k.volume, 0) / recent.length;
}

function detectPhase(klines: KLine[], indicators: IndicatorValues): { phase: WyckoffPhase; confidence: number } {
  if (klines.length < 50) return { phase: 'accumulation', confidence: 50 };

  const recent = klines.slice(-30);
  const price = klines[klines.length - 1].close;
  const highest = Math.max(...recent.map((k) => k.high));
  const lowest = Math.min(...recent.map((k) => k.low));
  const priceRange = highest - lowest;
  const midPoint = lowest + priceRange / 2;

  const avgVol = avgVolume(klines);
  const recentVol = klines.slice(-5).reduce((a, k) => a + k.volume, 0) / 5;
  const volRatio = recentVol / avgVol;

  const { adx, diPlus, diMinus, rsi } = indicators;

  // Markup: 强上涨趋势
  if (adx > 25 && diPlus > diMinus && price > highest * 0.97 && rsi > 50) {
    const conf = parseFloat(Math.min(90, 60 + adx - 25).toFixed(2));
    return { phase: 'markup', confidence: conf };
  }

  // Markdown: 强下跌趋势
  if (adx > 25 && diMinus > diPlus && price < lowest * 1.03 && rsi < 50) {
    const conf = parseFloat(Math.min(90, 60 + adx - 25).toFixed(2));
    return { phase: 'markdown', confidence: conf };
  }

  // Distribution: 顶部横盘, 放量滞涨
  if (price > midPoint && volRatio > 1.2 && adx < 25 && rsi > 55) {
    // 细化置信度：综合 volRatio 和 RSI 偏离程度
    const conf = parseFloat(Math.min(90, 60 + (volRatio - 1.2) * 15 + (rsi - 55) * 0.4).toFixed(2));
    return { phase: 'distribution', confidence: conf };
  }

  // Accumulation: 底部横盘, 缩量震荡
  if (price < midPoint && adx < 20 && rsi < 50) {
    const conf = parseFloat((volRatio < 0.8 ? Math.min(88, 70 + (0.8 - volRatio) * 40) : Math.min(72, 50 + (20 - adx) * 0.8)).toFixed(2));
    return { phase: 'accumulation', confidence: conf };
  }

  // Default by price position
  if (price > midPoint) return { phase: 'markup', confidence: 45.00 };
  return { phase: 'accumulation', confidence: 45.00 };
}

function detectPattern(klines: KLine[], phase: WyckoffPhase): { pattern: WyckoffPattern; confidence: number } {
  if (klines.length < 10) return { pattern: 'none', confidence: 0 };

  // 使用最近20-50根K线做形态判断（数据充足时取50根，最少20根）
  const lookback = Math.min(50, Math.max(20, klines.length));
  const recent = klines.slice(-lookback);
  const avgVol = avgVolume(klines);
  const last = klines[klines.length - 1];

  // 基准：取回望区间中间部分（排除最后5根）的高低点
  const baseKlines = recent.slice(0, -5);
  const prev3Low = Math.min(...baseKlines.map((k) => k.low));
  const prev3High = Math.max(...baseKlines.map((k) => k.high));

  // Spring: 假跌破后快速拉回 (in accumulation)
  if (phase === 'accumulation' || phase === 'markdown') {
    const dipped = recent.slice(-5).some((k) => k.low < prev3Low * 0.999);
    const recovered = last.close > prev3Low;
    const lowVol = last.volume < avgVol * 0.8;
    if (dipped && recovered) return { pattern: 'spring', confidence: lowVol ? 80 : 60 };
  }

  // UpThrust: 假突破后快速回落 (in distribution)
  if (phase === 'distribution' || phase === 'markup') {
    const spiked = recent.slice(-5).some((k) => k.high > prev3High * 1.001);
    const fell = last.close < prev3High;
    const highVol = last.volume > avgVol * 1.2;
    if (spiked && fell) return { pattern: 'upthrust', confidence: highVol ? 75 : 55 };
  }

  // SOS: 放量突破压力位
  if (phase === 'markup') {
    const breaking = last.close > prev3High && last.volume > avgVol * 1.5;
    if (breaking) return { pattern: 'sos', confidence: 80 };
  }

  // SOW: 放量跌破支撑位
  if (phase === 'markdown') {
    const breaking = last.close < prev3Low && last.volume > avgVol * 1.5;
    if (breaking) return { pattern: 'sow', confidence: 80 };
  }

  return { pattern: 'none', confidence: 0 };
}

function analyzeVolumeVerification(klines: KLine[]): WyckoffAnalysis['volumeVerification'] {
  if (klines.length < 20) return 'neutral';
  const avgVol = avgVolume(klines);
  const last = klines[klines.length - 1];
  const priceUp = last.close > klines[klines.length - 2].close;
  const highVol = last.volume > avgVol * 1.3;
  const lowVol = last.volume < avgVol * 0.7;

  if (priceUp && highVol) return 'bullish';
  if (!priceUp && highVol) return 'bearish';
  if (priceUp && lowVol) return 'divergence';
  if (!priceUp && lowVol) return 'divergence';
  return 'neutral';
}

function calcCauseEffect(klines: KLine[], phase: WyckoffPhase): WyckoffAnalysis['causeAndEffect'] {
  if (klines.length < 20) {
    const price = klines[klines.length - 1]?.close ?? 0;
    return { accumulationRange: 0, targetConservative: price, targetIdeal: price, targetAggressive: price };
  }

  const currentPrice = klines[klines.length - 1].close;
  const isBullish = phase === 'accumulation' || phase === 'markup';

  // 识别横盘区间：找连续价格波动小于整体振幅20%的最近K线段（最多取80根）
  const lookback = klines.slice(-80);
  const totalHigh = Math.max(...lookback.map(k => k.high));
  const totalLow  = Math.min(...lookback.map(k => k.low));
  const totalRange = totalHigh - totalLow;
  const consolidationThreshold = totalRange * 0.20; // 横盘判定阈值

  // 从近到远找最长的横盘段
  let rangeHigh = currentPrice;
  let rangeLow  = currentPrice;
  let consolidationLen = 0;

  for (let i = lookback.length - 1; i >= 0; i--) {
    const newHigh = Math.max(rangeHigh, lookback[i].high);
    const newLow  = Math.min(rangeLow,  lookback[i].low);
    if (newHigh - newLow > consolidationThreshold) break;
    rangeHigh = newHigh;
    rangeLow  = newLow;
    consolidationLen++;
    if (consolidationLen >= 30) break; // 最多30根K线的横盘段
  }

  // 横盘宽度 = 区间高点 - 低点（不足时降级用最近20根振幅）
  const consolidationWidth = consolidationLen >= 5
    ? (rangeHigh - rangeLow)
    : (Math.max(...klines.slice(-20).map(k => k.high)) - Math.min(...klines.slice(-20).map(k => k.low)));

  // 基准价：做多用区间低点，做空用区间高点
  const basePrice = isBullish ? rangeLow : rangeHigh;

  // 方向决定目标方向
  const t1 = isBullish ? basePrice + consolidationWidth * 1.0 : basePrice - consolidationWidth * 1.0;
  const t2 = isBullish ? basePrice + consolidationWidth * 2.0 : basePrice - consolidationWidth * 2.0;
  const t3 = isBullish ? basePrice + consolidationWidth * 3.0 : basePrice - consolidationWidth * 3.0;

  return {
    accumulationRange: consolidationWidth,
    targetConservative: t1,
    targetIdeal: t2,
    targetAggressive: t3,
  };
}

function describeCompositeman(phase: WyckoffPhase, pattern: WyckoffPattern, volVerification: WyckoffAnalysis['volumeVerification']): string {
  const actions: string[] = [];

  if (phase === 'accumulation') actions.push('复合人正在底部静默吸筹');
  else if (phase === 'markup') actions.push('复合人推动价格上涨，主动做多');
  else if (phase === 'distribution') actions.push('复合人在高位分批派发筹码');
  else actions.push('复合人压制价格，持续出货');

  if (pattern === 'spring') actions.push('制造假跌破诱空散户');
  else if (pattern === 'upthrust') actions.push('制造假突破诱多散户');
  else if (pattern === 'sos') actions.push('放量突破确认上涨意图');
  else if (pattern === 'sow') actions.push('放量破位确认下跌意图');

  if (volVerification === 'divergence') actions.push('量价背离，警惕陷阱');

  return actions.join('；');
}

export function analyzeWyckoff(klines: KLine[], indicators: IndicatorValues): WyckoffAnalysis {
  const { phase, confidence: phaseConf } = detectPhase(klines, indicators);
  const { pattern, confidence: patternConf } = detectPattern(klines, phase);
  const volVerification = analyzeVolumeVerification(klines);
  const causeAndEffect = calcCauseEffect(klines, phase);
  const compositeManBehavior = describeCompositeman(phase, pattern, volVerification);

  return {
    phase, phaseConfidence: Math.max(0, Math.min(100, phaseConf)),
    pattern, patternConfidence: Math.max(0, Math.min(100, patternConf)),
    volumeVerification: volVerification,
    compositeManBehavior,
    causeAndEffect,
  };
}
