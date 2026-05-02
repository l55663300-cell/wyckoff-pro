import { KLine, Timeframe, ScoringResult, IndicatorValues, WyckoffAnalysis, ScoringDims } from '../types';

interface TimeframeData {
  timeframe: Timeframe;
  klines: KLine[];
  indicators: IndicatorValues;
}

const WEIGHTS: Record<Timeframe, number> = {
  '1d': 0.40,
  '4h': 0.30,
  '1h': 0.20,
  '15m': 0.10,
};

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '1d': '日线',
  '4h': '4小时',
  '1h': '1小时',
  '15m': '15分钟',
};

// ── 维度1：威科夫形态确认度（0–100）──
function calcWyckoffDim(wyckoff: WyckoffAnalysis): number {
  let score = wyckoff.phaseConfidence; // 基础：阶段置信度

  // 形态加成
  if (wyckoff.pattern === 'spring' || wyckoff.pattern === 'sos') score = Math.min(100, score + 15);
  else if (wyckoff.pattern === 'upthrust' || wyckoff.pattern === 'sow') score = Math.max(0, score - 15);

  // 阶段方向修正（吸筹/上涨看多，派发/下跌看空 → 都代表高确认度，用于概率计算）
  if (wyckoff.phase === 'markup' || wyckoff.phase === 'accumulation') score = Math.min(100, score + 5);
  if (wyckoff.phase === 'markdown' || wyckoff.phase === 'distribution') score = Math.min(100, score + 5);

  return Math.round(Math.max(0, Math.min(100, score)));
}

// ── 维度2：成交量配合度（0–100）──
function calcVolumeDim(wyckoff: WyckoffAnalysis, klines: KLine[]): number {
  let score = 50;

  if (wyckoff.volumeVerification === 'bullish') score = 80;
  else if (wyckoff.volumeVerification === 'bearish') score = 30;
  else if (wyckoff.volumeVerification === 'divergence') score = 25;
  else score = 50;

  // 近3根K线量价关系
  if (klines.length >= 20) {
    const last = klines[klines.length - 1];
    const avg20 = klines.slice(-20).reduce((a, k) => a + k.volume, 0) / 20;
    const isUp = last.close > last.open;
    const isHighVol = last.volume > avg20 * 1.5;
    const isLowVol  = last.volume < avg20 * 0.6;

    if (isUp && isHighVol) score = Math.min(100, score + 10);   // 放量上涨
    else if (!isUp && isHighVol) score = Math.max(0, score - 10); // 放量下跌
    else if (isLowVol) score = Math.max(0, score - 5);            // 缩量（不确定）
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}

// ── 维度3：多周期技术共振（0–100）──
function calcMomentumDim(timeframeData: TimeframeData[]): number {
  let bullSignals = 0, bearSignals = 0, totalSignals = 0;

  for (const { indicators: ind, klines } of timeframeData) {
    // RSI
    if (ind.rsiState === 'oversold') bullSignals++;
    else if (ind.rsiState === 'overbought') bearSignals++;
    else if (ind.rsi > 55) bullSignals += 0.5;
    else if (ind.rsi < 45) bearSignals += 0.5;
    totalSignals++;

    // MACD
    if (ind.macdState === 'golden') bullSignals++;
    else if (ind.macdState === 'dead') bearSignals++;
    totalSignals++;

    // BB位置
    if (ind.bbPosition === 'below_lower' || ind.bbPosition === 'near_lower') bullSignals++;
    else if (ind.bbPosition === 'above_upper' || ind.bbPosition === 'near_upper') bearSignals++;
    totalSignals++;

    // ADX方向
    if (ind.adxState === 'strong_bull') bullSignals++;
    else if (ind.adxState === 'strong_bear') bearSignals++;
    totalSignals++;
  }

  const net = (bullSignals - bearSignals) / Math.max(1, totalSignals);
  // net ∈ [-1, 1] → 映射到 [0, 100]
  return Math.round(Math.max(0, Math.min(100, 50 + net * 50)));
}

// ── 维度4：情绪面（0–100，极度恐慌 → 做多好时机, 极度贪婪 → 危险）──
// 注：此维度在 calcScoring 外部由 sentiment 数据注入，这里给出一个占位
function calcSentimentDim(fearGreed: number, fundingRate: number): number {
  let score = 50;

  // 极度恐慌（<20）→ 逆向看多机会
  if (fearGreed < 20) score = 80;
  else if (fearGreed < 35) score = 65;
  else if (fearGreed < 55) score = 50;
  else if (fearGreed < 75) score = 38;
  else score = 25; // 极度贪婪，危险

  // 资金费率极端 → 修正
  if (fundingRate > 0.002) score = Math.max(0, score - 15);        // 多头极度过热
  else if (fundingRate < -0.001) score = Math.min(100, score + 10); // 空头极度过热，反转机会

  return Math.round(Math.max(0, Math.min(100, score)));
}

// ── 单周期技术得分（-5 ~ +5，保持兼容）──
function scoreTimeframe(ind: IndicatorValues, klines: KLine[]): number {
  let score = 0;
  if (ind.rsiState === 'oversold') score += 2;
  else if (ind.rsiState === 'overbought') score -= 2;
  else if (ind.rsi > 50) score += 1;
  else score -= 1;

  if (ind.macdState === 'golden') score += 2;
  else if (ind.macdState === 'dead') score -= 2;

  if (ind.bbPosition === 'below_lower') score += 2;
  else if (ind.bbPosition === 'near_lower') score += 1;
  else if (ind.bbPosition === 'above_upper') score -= 2;
  else if (ind.bbPosition === 'near_upper') score -= 1;

  if (ind.adxState === 'strong_bull') score += 2;
  else if (ind.adxState === 'strong_bear') score -= 2;

  if (klines.length >= 3) {
    const last3 = klines.slice(-3);
    const avgV  = klines.slice(-20).reduce((a, k) => a + k.volume, 0) / 20;
    const priceUp  = last3[2].close > last3[0].close;
    const volHigh  = last3[2].volume > avgV * 1.2;
    if (priceUp && volHigh) score += 1;
    else if (!priceUp && volHigh) score -= 1;
  }

  return Math.max(-5, Math.min(5, score));
}

export interface CalcScoringOptions {
  fearGreed?: number;
  fundingRate?: number;
  orderbookScore?: number; // 0–100，由 App 层在订单簿数据到位后注入
}

export function calcScoring(
  timeframeData: TimeframeData[],
  wyckoff: WyckoffAnalysis,
  opts: CalcScoringOptions = {},
): ScoringResult {
  const { fearGreed = 50, fundingRate = 0, orderbookScore = 50 } = opts;

  // ── 多周期加权得分（兼容 breakdown 展示）──
  const breakdown = timeframeData.map(({ timeframe, klines, indicators }) => {
    const rawScore = scoreTimeframe(indicators, klines);
    const weight   = WEIGHTS[timeframe];
    return {
      timeframe,
      label:    TIMEFRAME_LABELS[timeframe],
      score:    rawScore,
      weight,
      weighted: rawScore * weight,
    };
  });

  let techScore = breakdown.reduce((a, b) => a + b.weighted, 0);

  // 威科夫相位加成（同原逻辑）
  if (wyckoff.phase === 'accumulation' && wyckoff.phaseConfidence > 60) techScore += 1;
  else if (wyckoff.phase === 'markup') techScore += 1.5;
  else if (wyckoff.phase === 'distribution' && wyckoff.phaseConfidence > 60) techScore -= 1;
  else if (wyckoff.phase === 'markdown') techScore -= 1.5;

  if (wyckoff.pattern === 'spring') techScore += 1;
  else if (wyckoff.pattern === 'upthrust') techScore -= 1;
  else if (wyckoff.pattern === 'sos') techScore += 1.5;
  else if (wyckoff.pattern === 'sow') techScore -= 1.5;

  techScore = Math.max(-10, Math.min(10, techScore));

  // ── 5维度计算 ──
  const primaryKlines = timeframeData.find((d) => d.timeframe === '1h')?.klines
    ?? timeframeData[0]?.klines ?? [];

  const dimWyckoff   = calcWyckoffDim(wyckoff);
  const dimVolume    = calcVolumeDim(wyckoff, primaryKlines);
  const dimMomentum  = calcMomentumDim(timeframeData);
  const dimSentiment = calcSentimentDim(fearGreed, fundingRate);
  const dimOrderbook = Math.max(0, Math.min(100, orderbookScore));

  const dims: ScoringDims = {
    wyckoff:   dimWyckoff,
    volume:    dimVolume,
    momentum:  dimMomentum,
    sentiment: dimSentiment,
    orderbook: dimOrderbook,
  };

  // ── 概率计算：5维加权（35%威科夫 + 25%量价 + 20%消息 + 20%订单簿）──
  // 注意：多周期技术共振融入 direction 判断，不单独权重以避免与 techScore 重复
  const dimWeightedAvg = (
    dimWyckoff   * 0.35 +
    dimVolume    * 0.25 +
    dimSentiment * 0.20 +
    dimOrderbook * 0.20
  );

  // techScore [-10,10] → [0,100]
  const techNorm = (techScore + 10) / 20 * 100;

  // 融合：技术共振占30%，5维占70%
  const rawProb = techNorm * 0.30 + dimWeightedAvg * 0.70;

  // 方向判断：仍以 techScore 为主，+维度辅助
  const direction = techScore > 2 ? 'long' : techScore < -2 ? 'short' : 'neutral';

  // 概率最终值：多空方向时收窄到 [40,92]，中性时收窄到 [40,65]
  let probability: number;
  if (direction === 'neutral') {
    probability = Math.round(Math.max(40, Math.min(65, rawProb)));
  } else {
    probability = Math.round(Math.max(40, Math.min(92, rawProb)));
  }

  const signals: string[] = [];
  if (wyckoff.pattern !== 'none') signals.push(`威科夫${wyckoff.pattern.toUpperCase()}形态`);
  if (wyckoff.volumeVerification === 'divergence') signals.push('量价背离预警');
  if (techScore > 5) signals.push('多周期强看涨共振');
  else if (techScore < -5) signals.push('多周期强看跌共振');
  if (fearGreed < 25) signals.push('极度恐慌·逆向机会');
  else if (fearGreed > 75) signals.push('极度贪婪·注意风险');

  return {
    score: parseFloat(techScore.toFixed(2)),
    probability,
    direction,
    breakdown,
    signals,
    dims,
  };
}
