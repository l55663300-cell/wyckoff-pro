import { IndicatorValues, WyckoffAnalysis, FibonacciLevels, VolumeProfileNode, RiskPlan, Direction, Timeframe } from '../types';

/** 每个周期的策略参数 */
export const TIMEFRAME_RISK_CONFIG: Record<Timeframe, {
  label: string;
  strategyType: string;
  atrMultiplier: number;
  positionMin: number;
  positionMax: number;
  leverage: number;
}> = {
  '15m': { label: '15分钟', strategyType: '短线', atrMultiplier: 1.5, positionMin: 1.5, positionMax: 2.0, leverage: 30 },
  '1h':  { label: '1小时',  strategyType: '中短线', atrMultiplier: 1.8, positionMin: 2.0, positionMax: 2.0, leverage: 30 },
  '4h':  { label: '4小时',  strategyType: '中线', atrMultiplier: 2.0, positionMin: 2.0, positionMax: 3.0, leverage: 30 },
  '1d':  { label: '日线',   strategyType: '长线', atrMultiplier: 2.5, positionMin: 3.0, positionMax: 4.0, leverage: 30 },
};

/**
 * 计算入场区间：±0.3%~0.5%，基准选择 POC 与 61.8%回撤位 中更接近当前价的那个
 * 高波动（ATR/价格 > 2%）时放宽至 ±0.5%，否则 ±0.3%
 */
function calcEntryZone(
  price: number,
  atr: number,
  fib: FibonacciLevels,
  volumeProfile: VolumeProfileNode[],
  direction: 'long' | 'short'
): { entryLow: number; entryHigh: number; keySupport: number; keyLabel: string } {
  const poc = volumeProfile.find((n) => n.isPOC);
  const r618 = fib.retracements.find((r) => r.level === 0.618)?.price ?? null;
  const r382 = fib.retracements.find((r) => r.level === 0.382)?.price ?? null;

  // 选 POC 与 61.8% 中更接近当前价的作为基准
  let keySupport = price;
  let keyLabel = 'POC';

  const candidates: { price: number; label: string }[] = [];
  if (poc) candidates.push({ price: poc.priceMid, label: 'POC' });
  if (r618 !== null) candidates.push({ price: r618, label: '61.8%' });

  if (candidates.length > 0) {
    // 做多：取低于当前价且最近的；做空：取高于当前价且最近的
    const filtered = direction === 'long'
      ? candidates.filter((c) => c.price <= price * 1.005)
      : candidates.filter((c) => c.price >= price * 0.995);

    if (filtered.length > 0) {
      const closest = filtered.reduce((a, b) =>
        Math.abs(a.price - price) < Math.abs(b.price - price) ? a : b
      );
      keySupport = closest.price;
      keyLabel = closest.label;
    } else {
      // 无法找到符合方向的候选，退化到38.2%
      const r382price = r382 ?? (direction === 'long' ? price * 0.99 : price * 1.01);
      keySupport = r382price;
      keyLabel = '38.2%';
    }
  }

  // 高波动放宽至0.5%，否则0.3%
  const rangeRatio = (atr / price) > 0.02 ? 0.005 : 0.003;
  const entryLow = keySupport * (1 - rangeRatio);
  const entryHigh = keySupport * (1 + rangeRatio);

  return { entryLow, entryHigh, keySupport, keyLabel };
}

export function calcRiskPlan(
  price: number,
  indicators: IndicatorValues,
  wyckoff: WyckoffAnalysis,
  fib: FibonacciLevels,
  direction: Direction,
  timeframe: Timeframe = '1h',
  volumeProfile: VolumeProfileNode[] = []
): RiskPlan {
  const { atr, adx } = indicators;
  const tfConf = TIMEFRAME_RISK_CONFIG[timeframe];
  const stopDistance = atr * tfConf.atrMultiplier;

  let entryLow: number, entryHigh: number, stopLoss: number;

  if (direction === 'long') {
    const zone = calcEntryZone(price, atr, fib, volumeProfile, 'long');
    entryLow = zone.entryLow;
    entryHigh = zone.entryHigh;
    stopLoss = entryLow - stopDistance;
  } else if (direction === 'short') {
    const zone = calcEntryZone(price, atr, fib, volumeProfile, 'short');
    entryLow = zone.entryLow;
    entryHigh = zone.entryHigh;
    stopLoss = entryHigh + stopDistance;
  } else {
    // 观望：以当前价为中心的窄区间仅做参考
    const rangeRatio = (atr / price) > 0.02 ? 0.005 : 0.003;
    entryLow = price * (1 - rangeRatio);
    entryHigh = price * (1 + rangeRatio);
    stopLoss = price - stopDistance;
  }

  const { targetConservative, targetIdeal, targetAggressive } = wyckoff.causeAndEffect;

  // Position sizing: ADX强趋势取上限，否则下限
  const positionSize = adx > 25 ? tfConf.positionMax : tfConf.positionMin;
  const leverage = tfConf.leverage;

  const entryMid = (entryLow + entryHigh) / 2;
  // causeAndEffect 已按方向输出正确价格（做空时 target < entryMid，做多时 target > entryMid）
  // 直接使用，不需要镜像翻转；只在目标方向与预期相反时做兜底修正
  let target1 = targetConservative;
  let target2 = targetIdeal;
  let target3 = targetAggressive;

  if (direction === 'short') {
    // 做空止盈必须在入场区间下方
    if (target1 >= entryLow) target1 = entryLow - Math.abs(entryMid - targetConservative || stopDistance * 1.5);
    if (target2 >= target1)  target2 = target1 - stopDistance;
    if (target3 >= target2)  target3 = target2 - stopDistance;
  } else if (direction === 'long') {
    // 做多止盈必须在入场区间上方
    if (target1 <= entryHigh) target1 = entryHigh + Math.abs(targetConservative - entryMid || stopDistance * 1.5);
    if (target2 <= target1)   target2 = target1 + stopDistance;
    if (target3 <= target2)   target3 = target2 + stopDistance;
  }

  const riskDist = Math.abs(entryMid - stopLoss);

  // ── 风险约束：每笔最大亏损 = 仓位 × 4% ──
  // 实际止损幅度若超过 4%*仓位/杠杆 则收窄停损（当前已由ATR决定，此处仅计算最大可承受止损）
  const MAX_LOSS_RATIO = positionSize * 0.04; // e.g. 仓位2% × 4% = 0.08% 账户损失
  // 最小目标距离：保证盈亏比 ≥ 1.5
  const MIN_RR = 1.5;
  const minRewardDist = riskDist * MIN_RR;

  // 若 target1 不足最低盈亏比要求，则校正至最小目标
  const rawReward = Math.abs(target1 - entryMid);
  if (rawReward < minRewardDist) {
    const correctedTarget = direction === 'long'
      ? entryMid + minRewardDist
      : entryMid - minRewardDist;
    target1 = correctedTarget;
    // target2/3 同步按比例校正
    const scale = minRewardDist / Math.max(rawReward, 1);
    target2 = direction === 'long'
      ? entryMid + Math.abs(target2 - entryMid) * scale
      : entryMid - Math.abs(target2 - entryMid) * scale;
    target3 = direction === 'long'
      ? entryMid + Math.abs(target3 - entryMid) * scale
      : entryMid - Math.abs(target3 - entryMid) * scale;
  }

  const reward = Math.abs(target1 - entryMid);
  const riskReward = riskDist > 0 ? reward / riskDist : 0;

  // 警告标志：盈亏比 < 1.5 不建议入场
  const rrWarning = riskReward < MIN_RR;

  // Time stop hours based on timeframe
  const timeStopMap: Record<Timeframe, number> = { '15m': 4, '1h': 16, '4h': 48, '1d': 120 };

  return {
    entryLow, entryHigh, stopLoss,
    target1, target2, target3,
    positionSize, leverage, riskReward,
    timeStopHours: timeStopMap[timeframe],
    rrWarning,
    maxLossRatio: MAX_LOSS_RATIO,
  };
}
