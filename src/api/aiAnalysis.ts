/**
 * AI 策略分析服务
 *
 * 数据流：
 *   本地算法（wyckoff + indicators + risk + sentiment）
 *     → 结构化 JSON Prompt
 *     → LLM（DeepSeek / GPT / Claude / Gemini）
 *     → 结构化策略报告 JSON
 *
 * 好处：
 *  - 计算逻辑不变，仅 Prompt 和 API Key 可配置
 *  - 随时换模型，无需改前端展示代码
 *  - LLM 能理解多因子交叉关系，输出有逻辑的自然语言
 */

import { AnalysisResult } from '../types';
import { callLLM, getLLMConfig, type LLMConfig } from './llmProvider';
import { formatPrice } from '../utils/formatters';

// ── AI 报告缓存（5分钟 TTL + 价格变化 < 0.3% 复用） ──
interface AICacheEntry {
  report: AIStrategyReport;
  price: number;
  cachedAt: number;
}
const aiReportCache = new Map<string, AICacheEntry>();
const AI_CACHE_TTL_MS = 5 * 60 * 1000;
const AI_CACHE_PRICE_CHANGE = 0.003;

function getAICacheKey(symbol: string, timeframe: string): string {
  return `${symbol}_${timeframe}`;
}

function checkAICache(symbol: string, timeframe: string, price: number): AIStrategyReport | null {
  const key = getAICacheKey(symbol, timeframe);
  const entry = aiReportCache.get(key);
  if (!entry) return null;
  const elapsed = Date.now() - entry.cachedAt;
  if (elapsed > AI_CACHE_TTL_MS) {
    aiReportCache.delete(key);
    return null;
  }
  const priceChange = Math.abs(price - entry.price) / entry.price;
  if (priceChange < AI_CACHE_PRICE_CHANGE) {
    return { ...entry.report, generatedAt: Date.now() };
  }
  return null;
}

function saveAICache(symbol: string, timeframe: string, price: number, report: AIStrategyReport): void {
  const key = getAICacheKey(symbol, timeframe);
  aiReportCache.set(key, { report, price, cachedAt: Date.now() });
}

export interface AIStrategyReport {
  /** 交易方向：做多 / 做空 / 观望 */
  direction: '做多' | '做空' | '观望';
  /** 综合评分 0-100 */
  score: number;
  /** 入场区间 */
  entryLow: number;
  entryHigh: number;
  /** 止损位 */
  stopLoss: number;
  /** 目标价一（保守） */
  target1: number;
  /** 目标价二（理想） */
  target2: number;
  /** 盈亏比 */
  riskReward: string;
  /** 建议仓位描述 */
  positionAdvice: string;
  /** 威科夫形态评分 0-100 */
  wyckoffScore: number;
  /** 成交量配合评分 0-100 */
  volumeScore: number;
  /** 订单簿筹码评分 0-100 */
  orderbookScore: number;
  /** AI分析摘要（自然语言） */
  summary: string;
  /** 威科夫阶段详细分析 */
  wyckoffAnalysis: string;
  /** 威科夫当前阶段名称 */
  wyckoffPhaseLabel: string;
  /** 阶段置信度 */
  phaseConfidence: number;
  /** 阶段进度百分比（0-100） */
  phaseProgress: number;
  /** 关键价格结构描述 */
  keyStructure: {
    support: string;
    resistance: string;
    chipZone: string;
    volumeState: string;
    springTest: string;
  };
  /** 综合判断（威科夫） */
  wyckoffConclusion: string;
  /** 市场综合情绪描述 */
  sentimentLabel: string;
  /** 情绪分 0-100 */
  sentimentScore: number;
  /** 新闻列表（带情感标签） */
  newsSummary: Array<{
    title: string;
    tag: '利好' | '利空' | '中性';
    source: string;
    time: string;
    impact: number; // 1-5星
  }>;
  /** 生成时使用的模型名称 */
  generatedBy: string;
  /** 生成时间戳 */
  generatedAt: number;
  /** 庄家行为叙事（1-3句话解释庄家之前的操作 + 为什么给出这个策略） */
  narrativeLine?: string;
}

const PHASE_LABELS: Record<string, string> = {
  accumulation: '积累阶段',
  markup: '上涨推动',
  distribution: '派发阶段',
  markdown: '下跌趋势',
};

const PHASE_PROGRESS: Record<string, number> = {
  accumulation: 62,
  markup: 80,
  distribution: 55,
  markdown: 75,
};

const PATTERN_MEANING: Record<string, string> = {
  spring: '弹簧测试（Spring）— 假跌破前低后快速收回，供应枯竭，强做多信号',
  upthrust: '上冲回落（UpThrust）— 假突破阻力后快速回落，需求不足，强做空信号',
  sos: '强势突破（SOS）— 放量突破前期高点，确认上升趋势启动',
  sow: '弱势破位（SOW）— 放量跌破前期低点，确认下降趋势启动',
  none: '当前无显著威科夫形态',
};

const KEY_LEVEL_DIRECTION: Record<string, string> = {
  accumulation: '上方阻力未突破',
  markup: '回调测试下方支撑',
  distribution: '下方支撑未跌破',
  markdown: '反弹测试上方阻力',
};

/** 将 AnalysisResult 序列化为供 LLM 阅读的结构化上下文 */
function buildMarketContext(result: AnalysisResult): string {
  const { symbol, price, wyckoff, scoring, risk, sentiment, news, volumeProfile, primaryIndicators, indicators } = result;
  const priceStr = formatPrice(price, symbol);
  const poc = volumeProfile.find((n) => n.isPOC);
  const patternDesc = PATTERN_MEANING[wyckoff.pattern] ?? '无显著形态';
  const keyLevelDir = KEY_LEVEL_DIRECTION[wyckoff.phase] ?? '方向待确认';

  const newsText = (news ?? []).slice(0, 5).map((n, i) =>
    `  ${i + 1}. ${n.titleZh ?? n.title} [${n.source}]`
  ).join('\n');

  // 多周期趋势一致性摘要
  const tfSummaries = Object.entries(indicators).map(([tf, ind]) => {
    const trend = ind.adxState === 'strong_bull' ? '强多' : ind.adxState === 'strong_bear' ? '强空' : ind.adxState === 'trending' ? '趋势中' : '震荡';
    return `${tf}:RSI${ind.rsi.toFixed(0)} ADX${ind.adx.toFixed(0)}(${trend}) MACD${ind.macdState}`;
  }).join(' | ');

  return `
## 当前市场数据（${symbol} · ${result.activeTimeframe}）

### 价格
- 当前价：$${priceStr}
- 24h涨跌：${result.priceChange24h >= 0 ? '+' : ''}${result.priceChange24h.toFixed(2)}%

### 威科夫分析
- 阶段：${PHASE_LABELS[wyckoff.phase]}（置信度 ${wyckoff.phaseConfidence}%）
- 形态：${wyckoff.pattern}（置信度 ${wyckoff.patternConfidence}%）
- 量价验证：${wyckoff.volumeVerification}
- 复合人判断：${wyckoff.compositeManBehavior}
- Cause-Effect积累区间：±$${wyckoff.causeAndEffect.accumulationRange.toFixed(0)}
- Cause-Effect目标（保守/理想/激进）：$${formatPrice(wyckoff.causeAndEffect.targetConservative, symbol)} / $${formatPrice(wyckoff.causeAndEffect.targetIdeal, symbol)} / $${formatPrice(wyckoff.causeAndEffect.targetAggressive, symbol)}

### 庄家行为时间线（请据此分析庄家意图，构建 narrativeLine）
- 当前状态：${PHASE_LABELS[wyckoff.phase]}，出现${patternDesc}
- 庄家动作描述：${wyckoff.compositeManBehavior}
- 因果法则宽度：±$${wyckoff.causeAndEffect.accumulationRange.toFixed(0)} → Effect 目标 $${formatPrice(wyckoff.causeAndEffect.targetConservative, symbol)}
- POC筹码密集区：${poc ? `$${formatPrice(poc.priceMid, symbol)}（相对现价${price > poc.priceMid ? '下方' : '上方'}${(Math.abs(price - poc.priceMid) / price * 100).toFixed(1)}%）` : '未识别'}
- 当前价位相对积累/派发区：${keyLevelDir}

### 多周期趋势一致性
${tfSummaries}

### 多周期技术指标（主周期 ${result.activeTimeframe}）
- RSI：${primaryIndicators.rsi.toFixed(1)}（${primaryIndicators.rsiState}）
- MACD：${primaryIndicators.macdState}（hist=${primaryIndicators.macdHist.toFixed(4)}）
- 布林带位置：${primaryIndicators.bbPosition}
- ADX：${primaryIndicators.adx.toFixed(1)}（${primaryIndicators.adxState}）
- ATR：$${formatPrice(primaryIndicators.atr, symbol)}

### 算法评分
- 综合方向：${scoring.direction}（概率 ${scoring.probability}%）
- 威科夫维度：${scoring.dims.wyckoff}/100
- 成交量维度：${scoring.dims.volume}/100
- 动量共振：${scoring.dims.momentum}/100
- 情绪维度：${scoring.dims.sentiment}/100
- 订单簿维度：${scoring.dims.orderbook}/100
- 预警信号：${scoring.signals.join('、') || '无'}

### 算法风控计划（供参考，你可优化）
- 入场区间：$${formatPrice(risk.entryLow, symbol)} - $${formatPrice(risk.entryHigh, symbol)}
- 止损：$${formatPrice(risk.stopLoss, symbol)}
- 目标一：$${formatPrice(risk.target1, symbol)}
- 目标二：$${formatPrice(risk.target2, symbol)}
- 盈亏比：${risk.riskReward.toFixed(2)}
- 仓位：${risk.positionSize}% × ${risk.leverage}x杠杆

### 成交量分布
- POC（最大成交量价位）：${poc ? `$${formatPrice(poc.priceMid, symbol)}（${poc.percentage.toFixed(1)}%）` : '未识别'}

### 情绪面
- 恐贪指数：${sentiment.fearGreed}（${sentiment.fearGreedLabel}）
- 24h变化：${sentiment.fearGreedChange >= 0 ? '+' : ''}${sentiment.fearGreedChange.toFixed(1)}
- 资金费率：${(sentiment.fundingRate * 100).toFixed(4)}%${sentiment.fundingRateAlert ? '（⚠️异常）' : ''}
- Taker主动买卖量比：${sentiment.takerBuyRatio.toFixed(3)}（${sentiment.takerBuyRatio > 0.55 ? '主动买盘偏多' : sentiment.takerBuyRatio < 0.45 ? '主动卖盘偏空' : '中性'}）

### 近期重要新闻（最多5条）
${newsText || '  暂无新闻数据'}
`.trim();
}

/** localStorage key，与 AdminPage AI调教室保持一致 */
const CUSTOM_PROMPT_KEY = 'wyckoff_system_prompt_v1';

const DEFAULT_SYSTEM_PROMPT = `你是一位专业的加密货币量化交易分析师，擅长威科夫理论、技术分析、资金流分析和宏观基本面判断。
你的任务是根据提供的市场结构化数据，综合基本面（新闻舆情）、技术面（威科夫+指标）、资金流（订单簿+资金费率），给出专业的交易策略报告。

**威科夫核心框架（必须应用在分析中）：**
1. Cause & Effect（因果法则）：横盘整理区间宽度（Cause）决定后续趋势高度（Effect），宽度越大目标越远。积累/派发越充分趋势越强。
2. Spring（弹簧测试）：假跌破前低支撑后快速收回，说明供应（卖盘）已枯竭，是积累完成的强做多信号。深度浅→可信度高。
3. UpThrust（上冲回落）：假突破阻力后快速回落，说明需求（买盘）不足，是派发完成的强做空信号。放量回落→可信度高。
4. LPS（Last Point of Support 最后支撑点）：积累末期缩量回踩不再创新低，是主力震仓结束的信号，二次入场良机。
5. LPSY（Last Point of Supply 最后派发点）：派发末期缩量反弹无力过前高，是主力诱多结束的信号，反弹做空良机。
6. Volume Verification（量价验证）：上涨放量+下跌缩量=健康趋势（牛市特征）；上涨缩量+下跌放量=背离（熊市特征）。放量滞涨/缩量不跌都是关键信号。

**【最高优先级】价格方向铁律，违反即为错误，输出前必须自检：**
- 做多时：stopLoss < entryLow < entryHigh < target1 < target2（止损在下，止盈在上）
- 做空时：target2 < target1 < entryLow < entryHigh < stopLoss（止损在上，止盈在下，价格下跌才盈利）
- 做空时绝对不允许出现 target1 > entryLow 或 stopLoss < entryHigh 的情况

**其他规则：**
1. 你必须严格返回合法 JSON，不要包含任何 Markdown 代码块标记（不要用 \`\`\`json ... \`\`\`）
2. 所有价格必须是数字类型，不是字符串
3. direction 只能是"做多"、"做空"、"观望"之一
4. summary、wyckoffAnalysis、wyckoffConclusion 是中文自然语言，要有逻辑，体现你对多因子交叉的理解
5. 不要照抄算法给出的数字，用你的判断做微调或确认，并在 summary 中解释原因
6. 新闻 tag 只能是"利好"、"利空"、"中性"之一
7. narrativeLine 是必填字段，用1-3句自然语言讲清楚"庄家之前做了什么→市场为什么走到现在的位置→为什么给出这个策略"`;

/** 读取当前生效的 System Prompt（优先使用 AI调教室自定义，否则用默认） */
function getSystemPrompt(): string {
  try {
    const custom = localStorage.getItem(CUSTOM_PROMPT_KEY);
    if (custom && custom.trim().length > 20) return custom.trim();
  } catch {}
  return DEFAULT_SYSTEM_PROMPT;
}

/** 供 AdminPage AI调教室：保存自定义 System Prompt */
export function saveSystemPrompt(prompt: string): void {
  localStorage.setItem(CUSTOM_PROMPT_KEY, prompt.trim());
}

/** 供 AdminPage AI调教室：重置为默认 System Prompt */
export function resetSystemPrompt(): void {
  localStorage.removeItem(CUSTOM_PROMPT_KEY);
}

/** 供 AdminPage AI调教室：读取当前 Prompt（初始化 textarea 用） */
export function loadSystemPrompt(): string {
  try {
    const custom = localStorage.getItem(CUSTOM_PROMPT_KEY);
    if (custom && custom.trim().length > 20) return custom.trim();
  } catch {}
  return DEFAULT_SYSTEM_PROMPT;
}

function buildOutputFormat(direction: 'long' | 'short' | 'neutral', price: number): string {
  // 根据方向生成正确的示例价格，让 AI 有数字锚点
  const isShort = direction === 'short';
  const sl  = isShort ? (price * 1.025).toFixed(0) : (price * 0.975).toFixed(0);
  const eL  = isShort ? (price * 1.003).toFixed(0) : (price * 0.997).toFixed(0);
  const eH  = isShort ? (price * 1.008).toFixed(0) : (price * 1.002).toFixed(0);
  const t1  = isShort ? (price * 0.960).toFixed(0) : (price * 1.040).toFixed(0);
  const t2  = isShort ? (price * 0.930).toFixed(0) : (price * 1.070).toFixed(0);
  const dirLabel = isShort ? '做空' : direction === 'long' ? '做多' : '观望';
  const priceHint = isShort
    ? `⚠️ 做空示例：stopLoss(${sl}) > entryHigh(${eH}) > entryLow(${eL}) > target1(${t1}) > target2(${t2})`
    : `做多示例：stopLoss(${sl}) < entryLow(${eL}) < entryHigh(${eH}) < target1(${t1}) < target2(${t2})`;

  return `
${priceHint}

请严格返回如下 JSON 格式（不要加任何额外文字或代码块标记）：
{
  "direction": "${dirLabel}",
  "score": 75,
  "entryLow": ${eL},
  "entryHigh": ${eH},
  "stopLoss": ${sl},
  "target1": ${t1},
  "target2": ${t2},
  "riskReward": "2.0 : 1",
  "positionAdvice": "2% / 30x杠杆",
  "wyckoffScore": 75,
  "volumeScore": 72,
  "orderbookScore": 70,
  "summary": "（2-4句AI综合分析摘要，解释做出该方向判断的核心逻辑）",
  "wyckoffAnalysis": "（1-2句威科夫阶段详细解读）",
  "wyckoffPhaseLabel": "阶段名称",
  "phaseConfidence": 75,
  "phaseProgress": 60,
  "keyStructure": {
    "support": "支撑位描述",
    "resistance": "阻力位描述",
    "chipZone": "筹码密集区描述",
    "volumeState": "量价状态",
    "springTest": "弹簧测试状态"
  },
  "wyckoffConclusion": "（1-2句综合威科夫判断）",
  "sentimentLabel": "市场情绪描述",
  "sentimentScore": 55,
  "narrativeLine": "（必填）用1-3句自然语言，以庄家（做市商/机构大资金）的视角叙述：之前庄家做了什么动作→市场反应→当前处于什么结构位置→为什么给出这个策略。例如：庄家在过去2周在2200-2300区间反复吸筹，近期缩量回踩2270未破前低（Spring形态确认供应枯竭），随后放量突破2300阻力（SOS启动），目前处于积累完成后的上涨初期，建议顺势做多。",
  "newsSummary": [
    { "title": "新闻标题（中文）", "tag": "利好", "source": "来源", "time": "1小时前", "impact": 3 }
  ],
  "generatedBy": "模型名称",
  "generatedAt": 0
}`;
}

/**
 * 调用 LLM 生成完整策略报告
 * @param result 本地计算出的 AnalysisResult
 * @param config 可选，覆盖默认 LLM 配置
 */
export async function generateAIReport(
  result: AnalysisResult,
  config?: LLMConfig,
): Promise<AIStrategyReport> {
  const cfg = config ?? getLLMConfig();
  if (!cfg) {
    throw new Error('未配置 LLM，请在管理员后台设置 API Key 和模型');
  }

  // ── AI 报告缓存检查（5分钟 + 价格变化 < 0.3%） ──
  const cached = checkAICache(result.symbol, result.activeTimeframe, result.price);
  if (cached) {
    cached.generatedBy = '缓存';
    return cached;
  }

  const marketContext = buildMarketContext(result);
  const direction = result.scoring.direction; // 'long' | 'short' | 'neutral'
  const outputFormat = buildOutputFormat(direction, result.price);

  const messages = [
    { role: 'system' as const, content: getSystemPrompt() },
    {
      role: 'user' as const,
      content: `${marketContext}\n\n${outputFormat}`,
    },
  ];

  const llmRes = await callLLM(messages, cfg);

  // 解析 JSON
  let parsed: AIStrategyReport;
  try {
    // 容错：去掉可能残留的 markdown 代码块标记
    const cleaned = llmRes.content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM 返回格式解析失败：${llmRes.content.slice(0, 200)}`);
  }

  // ── 后置价格方向校验修正（兜底，防止 AI 仍然出错）──
  const isShort = parsed.direction === '做空';
  const entryMid = (parsed.entryLow + parsed.entryHigh) / 2;
  if (isShort) {
    // 做空：止损必须高于入场高价，止盈必须低于入场低价
    if (parsed.stopLoss <= parsed.entryHigh) {
      // AI 给的止损方向错误，用本地算法的止损覆盖
      parsed.stopLoss = result.risk.stopLoss > result.risk.entryHigh
        ? result.risk.stopLoss
        : parsed.entryHigh * 1.02;
    }
    if (parsed.target1 >= parsed.entryLow) {
      parsed.target1 = result.risk.target1 < result.risk.entryLow
        ? result.risk.target1
        : parsed.entryLow * 0.96;
    }
    if (parsed.target2 >= parsed.target1) {
      parsed.target2 = result.risk.target2 < result.risk.target1
        ? result.risk.target2
        : parsed.target1 * 0.96;
    }
  } else if (parsed.direction === '做多') {
    // 做多：止损必须低于入场低价，止盈必须高于入场高价
    if (parsed.stopLoss >= parsed.entryLow) {
      parsed.stopLoss = result.risk.stopLoss < result.risk.entryLow
        ? result.risk.stopLoss
        : parsed.entryLow * 0.98;
    }
    if (parsed.target1 <= parsed.entryHigh) {
      parsed.target1 = result.risk.target1 > result.risk.entryHigh
        ? result.risk.target1
        : parsed.entryHigh * 1.04;
    }
    if (parsed.target2 <= parsed.target1) {
      parsed.target2 = result.risk.target2 > result.risk.target1
        ? result.risk.target2
        : parsed.target1 * 1.04;
    }
  }
  // 重新计算盈亏比（修正后）
  const riskDist = Math.abs(entryMid - parsed.stopLoss);
  const rewardDist = Math.abs(parsed.target1 - entryMid);
  if (riskDist > 0) {
    const rr = (rewardDist / riskDist).toFixed(1);
    parsed.riskReward = `${rr} : 1`;
  }

  // 补充元信息
  parsed.generatedBy = llmRes.model ?? cfg.model;
  parsed.generatedAt = Date.now();

  // 写入 AI 报告缓存
  saveAICache(result.symbol, result.activeTimeframe, result.price, parsed);

  return parsed;
}

/**
 * 判断当前是否已配置 LLM
 */
export function isLLMConfigured(): boolean {
  return getLLMConfig() !== null;
}
