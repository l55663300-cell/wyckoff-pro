import type { AIStrategyReport } from '../api/aiAnalysis';

export interface KLine {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export type Symbol = string; // e.g. 'ETHUSDT','BTCUSDT','XAUTUSDT','SOLUSDT'...
export const DEFAULT_SYMBOLS = ['ETHUSDT', 'BTCUSDT', 'XAUTUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'] as const;
export type Timeframe = '1d' | '4h' | '1h' | '15m';
export type WyckoffPhase = 'accumulation' | 'markup' | 'distribution' | 'markdown';
export type WyckoffPattern = 'spring' | 'upthrust' | 'sos' | 'sow' | 'none';
export type Direction = 'long' | 'short' | 'neutral';

export interface IndicatorValues {
  rsi: number;
  rsiState: 'overbought' | 'oversold' | 'neutral';
  macd: number;
  macdSignal: number;
  macdHist: number;
  macdState: 'golden' | 'dead' | 'neutral';
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbPosition: 'above_upper' | 'near_upper' | 'middle' | 'near_lower' | 'below_lower';
  atr: number;
  adx: number;
  diPlus: number;
  diMinus: number;
  adxState: 'strong_bull' | 'strong_bear' | 'trending' | 'ranging';
}

export interface VolumeProfileNode {
  priceMin: number;
  priceMax: number;
  priceMid: number;
  volume: number;
  isPOC: boolean;
  isLowVolume: boolean;
  percentage: number;
}

export interface FibonacciLevels {
  high: number;
  low: number;
  retracements: { level: number; price: number; label: string }[];
  extensions: { level: number; price: number; label: string }[];
}

export interface RiskPlan {
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  positionSize: number;
  leverage: number;
  riskReward: number;
  timeStopHours: number;
  rrWarning: boolean;      // 盈亏比 < 1.5，不建议入场
  maxLossRatio: number;    // 仓位×4%，最大允许亏损比例
}

export interface ScoringBreakdown {
  timeframe: Timeframe;
  label: string;
  score: number;
  weight: number;
  weighted: number;
}

export interface ScoringDims {
  wyckoff: number;    // 0–100 威科夫形态确认度
  volume: number;     // 0–100 成交量配合度
  momentum: number;   // 0–100 多周期技术共振
  sentiment: number;  // 0–100 消息面情绪
  orderbook: number;  // 0–100 订单簿筹码压力（运行时注入）
}

export interface ScoringResult {
  score: number;
  probability: number;
  direction: Direction;
  breakdown: ScoringBreakdown[];
  signals: string[];
  dims: ScoringDims;
}

export interface WyckoffAnalysis {
  phase: WyckoffPhase;
  phaseConfidence: number;
  pattern: WyckoffPattern;
  patternConfidence: number;
  volumeVerification: 'bullish' | 'bearish' | 'divergence' | 'neutral';
  compositeManBehavior: string;
  causeAndEffect: {
    accumulationRange: number;
    targetConservative: number;
    targetIdeal: number;
    targetAggressive: number;
  };
}

export interface SentimentData {
  fearGreed: number;
  fearGreedPrev: number;
  fearGreedChange: number;
  fearGreedLabel: string;
  fundingRate: number;
  fundingRateAlert: boolean;
}

export interface NewsItem {
  title: string;
  titleZh?: string;  // 翻译后的中文标题
  link: string;
  pubDate: string;
  source: string;
  category?: 'macro' | 'blockchain' | 'crypto'; // 新闻分类
}

export interface AnalysisResult {
  symbol: Symbol;
  timestamp: number;
  price: number;
  priceChange24h: number;
  activeTimeframe: Timeframe;
  wyckoff: WyckoffAnalysis;
  indicators: { [key in Timeframe]: IndicatorValues };
  primaryIndicators: IndicatorValues;
  volumeProfile: VolumeProfileNode[];
  fibonacci: FibonacciLevels;
  scoring: ScoringResult;
  risk: RiskPlan;
  sentiment: SentimentData;
  news: NewsItem[];
  report: string;
  /** AI 大模型生成的深度报告（仅当后台配置了 LLM 且调用成功时存在） */
  aiReport?: AIStrategyReport;
}

export interface LoadingStep {
  id: number;
  label: string;
  done: boolean;
}
