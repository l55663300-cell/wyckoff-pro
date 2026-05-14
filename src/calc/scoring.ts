import { KLine, Timeframe, ScoringResult, IndicatorValues, WyckoffAnalysis, ScoringDims, SignalConsistency, Direction } from '../types';
import { calcEMA, getLatestEMA } from './ma';

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
  let score = wyckoff.phaseConfidence;
  if (wyckoff.pattern === 'spring' || wyckoff.pattern === 'sos') score = Math.min(100, score + 15);
  else if (wyckoff.pattern === 'upthrust' || wyckoff.pattern === 'sow') score = Math.max(0, score - 15);
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

  if (klines.length >= 20) {
    const last = klines[klines.length - 1];
    const avg20 = klines.slice(-20).reduce((a, k) => a + k.volume, 0) / 20;
    const isUp = last.close > last.open;
    const isHighVol = last.volume > avg20 * 1.5;
    const isLowVol  = last.volume < avg20 * 0.6;
    if (isUp && isHighVol) score = Math.min(100, score + 10);
    else if (!isUp && isHighVol) score = Math.max(0, score - 10);
    else if (isLowVol) score = Math.max(0, score - 5);
  }
  return Math.round(Math.max(0, Math.min(100, score)));
}

// ── 维度3：多周期技术共振（0–100）──
function calcMomentumDim(timeframeData: TimeframeData[]): number {
  let bullSignals = 0, bearSignals = 0, totalSignals = 0;
  for (const { indicators: ind } of timeframeData) {
    if (ind.rsiState === 'oversold') bullSignals++;
    else if (ind.rsiState === 'overbought') bearSignals++;
    else if (ind.rsi > 55) bullSignals += 0.5;
    else if (ind.rsi < 45) bearSignals += 0.5;
    totalSignals++;
    if (ind.macdState === 'golden') bullSignals++;
    else if (ind.macdState === 'dead') bearSignals++;
    totalSignals++;
    if (ind.bbPosition === 'below_lower' || ind.bbPosition === 'near_lower') bullSignals++;
    else if (ind.bbPosition === 'above_upper' || ind.bbPosition === 'near_upper') bearSignals++;
    totalSignals++;
    if (ind.adxState === 'strong_bull') bullSignals++;
    else if (ind.adxState === 'strong_bear') bearSignals++;
    totalSignals++;
  }
  const net = (bullSignals - bearSignals) / Math.max(1, totalSignals);
  return Math.round(Math.max(0, Math.min(100, 50 + net * 50)));
}

// ── 维度4：情绪面（0–100）──
function calcSentimentDim(fearGreed: number, fundingRate: number, takerBuyRatio: number = 0.5): number {
  let score = 50;
  if (fearGreed < 15) score = 78;
  else if (fearGreed < 25) score = 68;
  else if (fearGreed < 35) score = 58;
  else if (fearGreed < 65) score = 50;
  else if (fearGreed < 75) score = 42;
  else if (fearGreed < 85) score = 32;
  else score = 22;

  if (fundingRate > 0.003) score = Math.max(0, score - 12);
  else if (fundingRate > 0.001) score = Math.max(0, score - 5);
  else if (fundingRate < -0.002) score = Math.min(100, score + 10);
  else if (fundingRate < -0.001) score = Math.min(100, score + 5);

  // Taker 主动买入量比：>0.55 主动买盘占优偏多，<0.45 主动卖盘占优偏空
  if (takerBuyRatio > 0.6) score = Math.min(100, score + 8);
  else if (takerBuyRatio > 0.55) score = Math.min(100, score + 4);
  else if (takerBuyRatio < 0.4) score = Math.max(0, score - 8);
  else if (takerBuyRatio < 0.45) score = Math.max(0, score - 4);

  return Math.round(Math.max(0, Math.min(100, score)));
}

// ── 单周期技术得分（-5 ~ +5）──
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
  orderbookScore?: number;
  /** ADL 趋势斜率（日线） */
  adlTrend?: number;
  /** 成交量 Delta（4H） */
  volumeDelta?: number;
  /** OI 四象限值 */
  oiQuadrant?: number;
  /** 用于 EMA50 背景过滤的 1H K线 */
  klines1h?: KLine[];
  /** Taker 主动买入量占比（0~1，>0.5=主动买盘占优） */
  takerBuyRatio?: number;
}

/**
 * 计算信号一致性
 */
export function getSignalConsistency(
  phase: string,
  adlTrend: number,
  volumeDelta: number,
  oiQuadrant: number,
  finalDirection: 'long' | 'short' | 'neutral',
  backgroundBias: 'bullish' | 'bearish'
): SignalConsistency {
  const againstDetails: string[] = [];
  let supportCount = 0;
  let againstCount = 0;

  const phaseDirection = phase === 'markdown' ? 'short' : phase === 'markup' ? 'long' : 'neutral';
  if (phaseDirection === finalDirection) supportCount++;
  else if (phaseDirection !== 'neutral') { againstCount++; againstDetails.push('威科夫阶段方向不一致'); }

  const adlDirection = adlTrend > 0.5 ? 'long' : adlTrend < -0.5 ? 'short' : 'neutral';
  if (adlDirection === finalDirection) supportCount++;
  else if (adlDirection !== 'neutral') { againstCount++; againstDetails.push(adlTrend > 0 ? 'ADL累积(多头信号)' : 'ADL派发(空头信号)'); }

  const deltaDirection = volumeDelta > 0 ? 'long' : volumeDelta < 0 ? 'short' : 'neutral';
  if (deltaDirection === finalDirection) supportCount++;
  else if (deltaDirection !== 'neutral') { againstCount++; againstDetails.push(volumeDelta > 0 ? 'Delta正(主动买入)' : 'Delta负(主动卖出)'); }

  const oiDirection = oiQuadrant > 0.5 ? 'long' : oiQuadrant < -0.5 ? 'short' : 'neutral';
  if (oiDirection === finalDirection) supportCount++;
  else if (oiDirection !== 'neutral') { againstCount++; againstDetails.push(oiQuadrant > 0 ? 'OI多头主导' : 'OI空头主导'); }

  const biasDirection = backgroundBias === 'bullish' ? 'long' : 'short';
  if (biasDirection === finalDirection) supportCount++;
  else { againstCount++; againstDetails.push('EMA50背景方向相反'); }

  const total = supportCount + againstCount;
  let rating: SignalConsistency['rating'] = 'medium';
  if (againstCount === 0) rating = 'high';
  else if (againstCount >= 2) rating = 'low';

  return { rating, supportCount, againstCount, againstDetails };
}

export function calcScoring(
  timeframeData: TimeframeData[],
  wyckoff: WyckoffAnalysis,
  opts: CalcScoringOptions = {},
): ScoringResult {
  const { fearGreed = 50, fundingRate = 0, orderbookScore = 50, adlTrend = 0, volumeDelta = 0, oiQuadrant = 0, klines1h, takerBuyRatio = 0.5 } = opts;

  // ── 多周期加权得分 ──
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

  // 威科夫相位加成
  if (wyckoff.phase === 'accumulation' && wyckoff.phaseConfidence > 60) techScore += 1;
  else if (wyckoff.phase === 'markup') techScore += 1.5;
  else if (wyckoff.phase === 'distribution' && wyckoff.phaseConfidence > 60) techScore -= 1;
  else if (wyckoff.phase === 'markdown') techScore -= 1.5;

  if (wyckoff.pattern === 'spring') techScore += 1;
  else if (wyckoff.pattern === 'upthrust') techScore -= 1;
  else if (wyckoff.pattern === 'sos') techScore += 1.5;
  else if (wyckoff.pattern === 'sow') techScore -= 1.5;

  // ── 新增：ADL 趋势 (±0.5) ──
  if (adlTrend > 0.5) { techScore += 0.5; }
  else if (adlTrend < -0.5) { techScore -= 0.5; }

  // ── 新增：Volume Delta (±0.5) ──
  if (volumeDelta > 0) { techScore += 0.5; }
  else if (volumeDelta < 0) { techScore -= 0.5; }

  // ── 新增：OI 四象限 (±0.5) ──
  techScore += oiQuadrant * 0.5;

  // ── EMA50 背景过滤器（三态斜率：结合价格相对位置 + EMA50自身趋势）──
  let backgroundBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let emaTrend: 'up' | 'down' | 'flat' = 'flat';
  if (klines1h && klines1h.length >= 55) {
    const emaArr = calcEMA(klines1h, 50);
    const lastIdx = emaArr.length - 1;
    const currentPrice = klines1h[klines1h.length - 1].close;
    const ema50 = emaArr[lastIdx];

    // EMA50 斜率：比较 last 与 last-5 的位置变化
    const SLOPE_BARS = 5;
    if (lastIdx >= SLOPE_BARS) {
      const slopePct = (emaArr[lastIdx] - emaArr[lastIdx - SLOPE_BARS]) / emaArr[lastIdx - SLOPE_BARS] * 100;
      if (slopePct > 0.1) emaTrend = 'up';
      else if (slopePct < -0.1) emaTrend = 'down';
    }

    backgroundBias = currentPrice > ema50 ? 'bullish' : 'bearish';
    if (techScore > 0 && backgroundBias === 'bearish') {
      techScore *= emaTrend === 'down' ? 0.5 : 0.7;
    } else if (techScore < 0 && backgroundBias === 'bullish') {
      techScore *= emaTrend === 'up' ? 0.5 : 0.7;
    }
  }

  techScore = Math.max(-10, Math.min(10, techScore));

  // ── 5维度计算 ──
  const primaryKlines = timeframeData.find((d) => d.timeframe === '1h')?.klines
    ?? timeframeData[0]?.klines ?? [];

  const dimWyckoff   = calcWyckoffDim(wyckoff);
  const dimVolume    = calcVolumeDim(wyckoff, primaryKlines);
  const dimMomentum  = calcMomentumDim(timeframeData);
  const dimSentiment = calcSentimentDim(fearGreed, fundingRate, takerBuyRatio);
  const dimOrderbook = Math.max(0, Math.min(100, orderbookScore));

  const dims: ScoringDims = {
    wyckoff:   dimWyckoff,
    volume:    dimVolume,
    momentum:  dimMomentum,
    sentiment: dimSentiment,
    orderbook: dimOrderbook,
    adlTrend,
    volumeDelta,
    oiQuadrant,
  };

  // ── 概率计算：威科夫为核心，情绪仅作参考 ──
  const dimWeightedAvg = (
    dimWyckoff   * 0.45 +
    dimVolume    * 0.30 +
    dimOrderbook * 0.15 +
    dimSentiment * 0.10
  );
  const techNorm = (techScore + 10) / 20 * 100;
  const rawProb = techNorm * 0.30 + dimWeightedAvg * 0.70;

  const direction = techScore > 3 ? 'long' : techScore < -3 ? 'short' : 'neutral';

  // ── 概率基础（稍后根据一致性调整）──
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
  if (adlTrend > 0.5) signals.push('ADL累积上升');
  else if (adlTrend < -0.5) signals.push('ADL派发下降');
  if (oiQuadrant === 1) signals.push('OI价涨仓增·多头主导');
  else if (oiQuadrant === -1) signals.push('OI价跌仓增·空头主导');

  // ── 信号一致性 ──
  const consistency = getSignalConsistency(
    wyckoff.phase,
    adlTrend,
    volumeDelta,
    oiQuadrant,
    direction,
    backgroundBias === 'neutral' ? 'bearish' : backgroundBias,
  );

  // 一致性 low 且支持维度不足 → 强制降级为 neutral
  let effectiveDirection: Direction = direction;
  if (consistency.rating === 'low' && consistency.supportCount < 2) {
    effectiveDirection = 'neutral';
  }

  // 一致性影响概率：high +5%，low -10%
  let probAdjust = 0;
  if (consistency.rating === 'high') probAdjust = 5;
  else if (consistency.rating === 'low') probAdjust = -10;

  // 一致性低时概率上限收窄至 60%
  const probCap = (consistency.rating === 'low' && effectiveDirection !== 'neutral') ? 60 : 92;
  if (effectiveDirection === 'neutral') {
    probability = Math.round(Math.max(40, Math.min(65, rawProb + probAdjust)));
  } else {
    probability = Math.round(Math.max(40, Math.min(probCap, rawProb + probAdjust)));
  }

  return {
    score: parseFloat(techScore.toFixed(2)),
    probability,
    direction: effectiveDirection,
    breakdown,
    signals,
    dims,
    consistency,
  };
}
