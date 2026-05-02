import { AnalysisResult } from '../types';
import { formatPrice } from './formatters';

const PHASE_LABELS: Record<string, string> = {
  accumulation: '吸筹区',
  markup: '上涨趋势',
  distribution: '派发区',
  markdown: '下跌趋势',
};

const PATTERN_LABELS: Record<string, string> = {
  spring: '弹簧效应 (Spring)',
  upthrust: '假突破 (UpThrust)',
  sos: '力量迹象 (SOS)',
  sow: '弱势迹象 (SOW)',
  none: '无明显形态',
};

const VOL_LABELS: Record<string, string> = {
  bullish: '放量上涨 ✅',
  bearish: '放量下跌 ⚠️',
  divergence: '量价背离 ⚠️',
  neutral: '量价中性',
};

export function formatV23Report(result: AnalysisResult): string {
  const { symbol, price, wyckoff, scoring, risk, sentiment, news = [], primaryIndicators } = result;

  const timestamp = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const direction = scoring.direction === 'long' ? '做多 📈' : scoring.direction === 'short' ? '做空 📉' : '观望 👀';
  const sym = symbol.replace('USDT', '');
  const poc = result.volumeProfile.find((n) => n.isPOC);

  const lines: string[] = [
    `🦞【威科夫Pro · 简报】${timestamp}`,
    ``,
    `---`,
    `### 📊 市场状态 — 核心结论`,
    ``,
    `**${sym}/USDT** @ $${formatPrice(price, symbol)}`,
    `**威科夫阶段**：${PHASE_LABELS[wyckoff.phase] ?? wyckoff.phase}（置信度 ${wyckoff.phaseConfidence}%）`,
    `**识别形态**：${PATTERN_LABELS[wyckoff.pattern] ?? wyckoff.pattern}`,
    `**量价关系**：${VOL_LABELS[wyckoff.volumeVerification] ?? wyckoff.volumeVerification}`,
    `**ADX**：${primaryIndicators.adx.toFixed(1)} (${primaryIndicators.adx > 25 ? '强趋势' : primaryIndicators.adx < 20 ? '震荡市' : '趋势中'}) | **ATR**：${formatPrice(primaryIndicators.atr, symbol)}`,
    ``,
    `**复合人动向**：${wyckoff.compositeManBehavior}`,
    ``,
    `---`,
    `### 🎯 交易计划 — 概率 ${scoring.probability}% · ${direction}`,
    ``,
  ];

  if (scoring.direction !== 'neutral') {
    lines.push(
      `- **入场区**：$${formatPrice(risk.entryLow, symbol)} - $${formatPrice(risk.entryHigh, symbol)}`,
      `  *(斐波那契61.8%回撤 + ${poc ? `POC @ $${formatPrice(poc.priceMid, symbol)}` : '高成交量节点'})*`,
      `- **止损**：$${formatPrice(risk.stopLoss, symbol)} (ATR×2 动态止损)`,
      `- **止盈**：`,
      `  - 保守(50%) @ $${formatPrice(risk.target1, symbol)} *(1.272扩展)*`,
      `  - 理想(30%) @ $${formatPrice(risk.target2, symbol)} *(1.618扩展)*`,
      `  - 激进(20%) 跟踪移动止损`,
      ``,
      `**仓位**：${risk.positionSize}% | **杠杆**：${risk.leverage}x | **时间止损**：${risk.timeStopHours}h`,
      `**风险回报比**：1:${risk.riskReward.toFixed(2)}`,
    );
  } else {
    const r618 = result.fibonacci.retracements.find((r) => r.level === 0.618);
    const ext1272 = result.fibonacci.extensions.find((e) => e.level === 1.272);
    lines.push(
      `- **当前方向概率**：${scoring.probability}%（信号不明确，建议观望）`,
      `- **等待突破**：$${ext1272 ? formatPrice(ext1272.price, symbol) : formatPrice(price * 1.015, symbol)} 放量确认`,
      `- **回调支撑**：$${poc ? formatPrice(poc.priceMid, symbol) : (r618 ? formatPrice(r618.price, symbol) : formatPrice(price * 0.985, symbol))} 缩量企稳`,
    );
  }

  lines.push(
    ``,
    `---`,
    `### 🔑 决策依据`,
    ``,
    `1. **威科夫分析**：${PHASE_LABELS[wyckoff.phase]}（${wyckoff.phaseConfidence}%），识别到${PATTERN_LABELS[wyckoff.pattern]}，${wyckoff.compositeManBehavior}`,
    `2. **斐波那契+成交量**：入场区 $${formatPrice(risk.entryLow, symbol)}-$${formatPrice(risk.entryHigh, symbol)} 对应61.8%回撤位，${poc ? `与高成交量节点POC @ $${formatPrice(poc.priceMid, symbol)}形成双重支撑` : '等待成交量节点确认'}`,
    `3. **情绪/消息**：恐贪指数 ${sentiment.fearGreed}（${sentiment.fearGreedLabel}）${Math.abs(sentiment.fearGreedChange) >= 15 ? `，日变化 ${sentiment.fearGreedChange > 0 ? '+' : ''}${sentiment.fearGreedChange} ⚡情绪剧变` : '，情绪稳定'}；资金费率 ${(sentiment.fundingRate * 100).toFixed(4)}%${sentiment.fundingRateAlert ? ' ⚠️已触发过热阈值' : ''}`,
    ``,
  );

  if (news.length > 0) {
    lines.push(
      `---`,
      `### 📌 今日异动关注`,
      ``,
      ...news.slice(0, 3).map((n) => `- **${n.title}**  \n  _${n.source}_`),
      ``,
    );
  }

  lines.push(
    `---`,
    ``,
    `_数据驱动，逻辑为王 🦞_`,
  );

  return lines.join('\n');
}
