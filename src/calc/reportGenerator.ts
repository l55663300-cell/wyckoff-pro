import { AnalysisResult } from '../types';
import { formatPrice, formatFundingRate, formatPercent, formatDateTime } from '../utils/formatters';

const PHASE_LABEL: Record<string, string> = {
  accumulation: '吸筹区',
  markup: '上涨趋势',
  distribution: '派发区',
  markdown: '下跌趋势',
};

const PATTERN_LABEL: Record<string, string> = {
  spring: 'Spring弹簧',
  upthrust: 'UpThrust假突破',
  sos: 'SOS力量迹象',
  sow: 'SOW弱势迹象',
  none: '无明显形态',
};

const VOL_LABEL: Record<string, string> = {
  bullish: '✅健康(放量上涨)',
  bearish: '⚠️看空(放量下跌)',
  divergence: '⚠️背离',
  neutral: '中性',
};

const ADX_STATE_LABEL: Record<string, string> = {
  strong_bull: `强趋势多`,
  strong_bear: `强趋势空`,
  trending: '趋势中',
  ranging: '震荡市',
};

export function generateReport(result: AnalysisResult): string {
  const { symbol, timestamp, price, wyckoff, primaryIndicators, scoring, risk, sentiment, news } = result;
  const priceStr = formatPrice(price, symbol);
  const dt = formatDateTime(timestamp);

  const phaseLabel = PHASE_LABEL[wyckoff.phase];
  const patternLabel = PATTERN_LABEL[wyckoff.pattern];
  const volLabel = VOL_LABEL[wyckoff.volumeVerification];
  const adxLabel = ADX_STATE_LABEL[primaryIndicators.adxState];

  const direction = scoring.direction === 'long' ? '做多' : scoring.direction === 'short' ? '做空' : '观望';
  const adxEnv = primaryIndicators.adx > 25 ? `强趋势>${25}` : `震荡<20`;

  const fgAlert = Math.abs(sentiment.fearGreedChange) >= 15 ? ` ⚡变化${formatPercent(sentiment.fearGreedChange, 0)}` : '';
  const frAlert = sentiment.fundingRateAlert ? ' ⚠️异常' : '';

  const newsSection = (news ?? []).slice(0, 3).map((n, i) => `${i + 1}. ${n.title.slice(0, 60)}... [${n.source}]`).join('\n- ');

  const poc = result.volumeProfile.find((n) => n.isPOC);
  const pocStr = poc ? `POC @ $${formatPrice(poc.priceMid, symbol)}` : '无明显POC';

  const report = `🦞【威科夫Pro · 简报】${dt}

---
### 📊 市场状态 — 核心结论
**${symbol}** @ $${priceStr} | **阶段**：${phaseLabel}(${wyckoff.phaseConfidence}%) | **形态**：${patternLabel}
**量价**：${volLabel} | **环境**：ADX ${primaryIndicators.adx.toFixed(1)} (${adxLabel}) | ATR ${formatPrice(primaryIndicators.atr, symbol)}

**复合人动向**：${wyckoff.compositeManBehavior}

---
### 🎯 交易计划 — 概率 ${scoring.probability}% (${direction})
- **入场区**：$${formatPrice(risk.entryLow, symbol)} - $${formatPrice(risk.entryHigh, symbol)} *(斐波纳契61.8%回撤 + ${pocStr})*
- **止损**：$${formatPrice(risk.stopLoss, symbol)} (ATR×2动态)
- **止盈**：
  - 保守(50%) @ $${formatPrice(risk.target1, symbol)} *(1.272扩展)*
  - 理想(30%) @ $${formatPrice(risk.target2, symbol)} *(1.618扩展)*
  - 移动(20%) 跟踪止损

**仓位**：${scoring.direction === 'neutral' ? '观望' : `${risk.positionSize}% (${risk.leverage}x杠杆) | 风险收益比 ${risk.riskReward.toFixed(2)}`} | **风控**：时间止损 ${risk.timeStopHours}h

---
### 🔑 决策依据
1. **威科夫**：${phaseLabel}阶段，${patternLabel}形态，${volLabel}
2. **斐波那契+成交量**：${pocStr}，回撤区 $${formatPrice(risk.entryLow, symbol)}-$${formatPrice(risk.entryHigh, symbol)} 与高成交量节点${poc ? '重合' : '附近'}
3. **情绪/消息**：恐贪指数 ${sentiment.fearGreed}(${sentiment.fearGreedLabel})${fgAlert}，资金费率 ${formatFundingRate(sentiment.fundingRate)}${frAlert}

---
### 📌 今日异动关注
- ${newsSection}

_数据驱动，逻辑为王 🦞_`;

  return report;
}
