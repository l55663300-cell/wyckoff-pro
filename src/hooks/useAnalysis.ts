import { useState, useCallback, useRef } from 'react';
import { AnalysisResult, Symbol, Timeframe, LoadingStep } from '../types';
import { fetchKlines, fetchFundingRate, fetchTicker24h, fetchTakerBuyRatio } from '../api/binanceApi';
import { buildSentimentData } from '../api/fearGreedApi';
import { calcIndicators, calcADL, calcVolumeDelta } from '../calc/indicators';
import { analyzeWyckoff } from '../calc/wyckoff';
import { calcVolumeProfile } from '../calc/volumeProfile';
import { calcFibonacci } from '../calc/fibonacci';
import { calcRiskPlan } from '../calc/riskControl';
import { calcScoring } from '../calc/scoring';
import { generateReport } from '../calc/reportGenerator';
import { generateAIReport, isLLMConfigured } from '../api/aiAnalysis';
import { fetchSocialHeat } from '../api/socialApi';
import { getLatestEMA } from '../calc/ma';
import { saveStrategy } from '../utils/strategyHistory';

const ALL_TIMEFRAMES: Timeframe[] = ['1d', '4h', '1h', '15m'];

/** 缓存有效期：60分钟 */
const CACHE_TTL_MS = 60 * 60 * 1000;
/** 同币种+周期重新分析冷却：3分钟 */
export const REANALYZE_COOLDOWN_MS = 3 * 60 * 1000;

interface CacheEntry {
  result: AnalysisResult;
  cachedAt: number;
}

const INITIAL_STEPS: LoadingStep[] = [
  { id: 1,  label: '抓取K线数据 (4周期)', done: false },
  { id: 2,  label: '获取资金费率', done: false },
  { id: 3,  label: '计算技术指标', done: false },
  { id: 4,  label: '威科夫阶段识别', done: false },
  { id: 5,  label: '形态识别分析', done: false },
  { id: 6,  label: '量价验证', done: false },
  { id: 7,  label: 'Volume Profile计算', done: false },
  { id: 8,  label: '斐波那契分析', done: false },
  { id: 9,  label: '复合人行为分析', done: false },
  { id: 10, label: '多周期共振打分', done: false },
  { id: 11, label: '因果法则测算', done: false },
  { id: 12, label: '动态风控计算', done: false },
  { id: 13, label: '市场情绪验证', done: false },
  { id: 14, label: '生成策略简报', done: false },
  { id: 15, label: 'AI 大模型深度解读', done: false },
  { id: 16, label: '社交热度分析', done: false },
];

export function useAnalysis() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<LoadingStep[]>(INITIAL_STEPS);
  const [error, setError] = useState<string | null>(null);

  /**
   * 跨币种全局缓存：key = "SYMBOL_TIMEFRAME"
   * 切换币种不清空，TTL 60分钟过期后才重新消耗积分
   */
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  /** 当前请求的 AbortController，切换时取消上一个请求 */
  const abortCtrlRef = useRef<AbortController | null>(null);

  const analyze = useCallback(async (symbol: Symbol, activeTimeframe: Timeframe = '1h') => {
    // 取消上一次未完成的请求
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
    }
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;
    const signal = ctrl.signal;

    setLoading(true);
    setError(null);
    const freshSteps = INITIAL_STEPS.map((s) => ({ ...s, done: false }));
    setSteps(freshSteps);

    try {
      // Step 1: Fetch klines for all timeframes in parallel
      const klineData = await Promise.all(
        ALL_TIMEFRAMES.map((tf) => fetchKlines(symbol, tf, 1000))
      );
      const klinesMap = Object.fromEntries(
        ALL_TIMEFRAMES.map((tf, i) => [tf, klineData[i]])
      ) as Record<Timeframe, ReturnType<typeof fetchKlines> extends Promise<infer T> ? T : never>;

      // K线最低数量校验：任意周期不足 50 根时给出友好提示
      for (const tf of ALL_TIMEFRAMES) {
        const len = klinesMap[tf]?.length ?? 0;
        if (len < 50) {
          throw new Error(`${symbol} ${tf} 周期K线数据不足（仅 ${len} 根），无法进行分析，请稍后重试`);
        }
      }

      setSteps((prev) => prev.map((s) => s.id === 1 ? { ...s, done: true } : s));

      // Step 2: Fetch funding rate, ticker, and taker buy ratio in parallel
      const [fundingRate, ticker, takerBuyRatio] = await Promise.all([
        fetchFundingRate(symbol),
        fetchTicker24h(symbol),
        fetchTakerBuyRatio(symbol),
      ]);
      setSteps((prev) => prev.map((s) => s.id === 2 ? { ...s, done: true } : s));

      // Step 3: Calculate indicators for all timeframes
      const indicatorsMap = Object.fromEntries(
        ALL_TIMEFRAMES.map((tf) => [tf, calcIndicators(klinesMap[tf])])
      ) as AnalysisResult['indicators'];

      // Use the active timeframe as primary for analysis
      const primaryIndicators = indicatorsMap[activeTimeframe];
      setSteps((prev) => prev.map((s) => s.id === 3 ? { ...s, done: true } : s));

      const primaryKlines = klinesMap[activeTimeframe];

      // Step 4-6: Wyckoff analysis on active timeframe
      const wyckoff = analyzeWyckoff(primaryKlines, primaryIndicators);
      setSteps((prev) => prev.map((s) => (s.id === 4 || s.id === 5 || s.id === 6) ? { ...s, done: true } : s));

      // Step 7: Volume Profile
      const volumeProfile = calcVolumeProfile(primaryKlines);
      setSteps((prev) => prev.map((s) => s.id === 7 ? { ...s, done: true } : s));

      // Step 8: Fibonacci
      const fibonacci = calcFibonacci(primaryKlines);
      setSteps((prev) => prev.map((s) => s.id === 8 ? { ...s, done: true } : s));

      // Step 9: Composite man (already in wyckoff)
      setSteps((prev) => prev.map((s) => s.id === 9 ? { ...s, done: true } : s));

      // ── 新增：ADL / Volume Delta / EMA50 计算 ──
      const klines1d = klinesMap['1d'];
      const klines4h = klinesMap['4h'];
      const klines1h = klinesMap['1h'];

      // ADL 趋势斜率（日线）
      const adlSeries = klines1d ? calcADL(klines1d) : [];
      const adlValues = adlSeries.map(p => p.value);
      const adlTrend = adlValues.length >= 10
        ? (adlValues[adlValues.length - 1] - adlValues[0]) / adlValues.length / (Math.abs(adlValues[0]) || 1)
        : 0;

      // 成交量 Delta（4H × 24根）
      const volumeDelta = klines4h ? calcVolumeDelta(klines4h, 24) : 0;

      // 构造评分扩展参数
      const scoringOpts = {
        fundingRate,
        adlTrend,
        volumeDelta,
        oiQuadrant: 0, // OI 数据暂无 API，预留为 0
        klines1h,
        takerBuyRatio,
      };

      // Step 10-11: Scoring
      const timeframeData = ALL_TIMEFRAMES.map((tf) => ({
        timeframe: tf,
        klines: klinesMap[tf],
        indicators: indicatorsMap[tf],
      }));
      const scoring = calcScoring(timeframeData, wyckoff, scoringOpts);
      setSteps((prev) => prev.map((s) => (s.id === 10 || s.id === 11) ? { ...s, done: true } : s));

      // Step 12: Risk control
      const risk = calcRiskPlan(ticker.price, primaryIndicators, wyckoff, fibonacci, scoring.direction, activeTimeframe, volumeProfile);
      setSteps((prev) => prev.map((s) => s.id === 12 ? { ...s, done: true } : s));

      // Step 13: Sentiment
      const sentiment = await buildSentimentData(fundingRate, takerBuyRatio);
      setSteps((prev) => prev.map((s) => s.id === 13 ? { ...s, done: true } : s));

      const finalScoring = calcScoring(timeframeData, wyckoff, {
        ...scoringOpts,
        fearGreed: sentiment.fearGreed,
      });

      // 入场区方向校验：如果 risk 判定入场区已突破（支撑/阻力失效），覆盖方向为观望
      if (risk.directionOverride === 'neutral') {
        finalScoring.direction = 'neutral';
      }

      // Step 14: Generate local report
      const partial: Omit<AnalysisResult, 'report' | 'aiReport'> = {
        symbol, timestamp: Date.now(),
        price: ticker.price,
        priceChange24h: ticker.priceChange24h,
        activeTimeframe,
        wyckoff, indicators: indicatorsMap,
        primaryIndicators, volumeProfile, fibonacci,
        scoring: finalScoring, risk, sentiment,
        news: [],
      };
      const report = generateReport({ ...partial, report: '', aiReport: undefined });
      setSteps((prev) => prev.map((s) => s.id === 14 ? { ...s, done: true } : s));

      // Step 15: AI report
      let aiReport: AnalysisResult['aiReport'] = undefined;
      if (isLLMConfigured()) {
        try {
          aiReport = await generateAIReport({ ...partial, report, aiReport: undefined });
        } catch (aiErr: any) {
          console.warn('[AI Report] 生成失败，已降级本地报告：', aiErr?.message);
        }
      }
      setSteps((prev) => prev.map((s) => s.id === 15 ? { ...s, done: true } : s));

      // Step 16: Social heat
      let socialHeat: AnalysisResult['socialHeat'] = null;
      try {
        socialHeat = await fetchSocialHeat(symbol);
      } catch {
        // 不影响主流程
      }
      setSteps((prev) => prev.map((s) => s.id === 16 ? { ...s, done: true } : s));

      const finalResult: AnalysisResult = { ...partial, report, aiReport, socialHeat };

      // 写入跨币种全局缓存（带 TTL 时间戳）
      cacheRef.current.set(`${symbol}_${activeTimeframe}`, {
        result: finalResult,
        cachedAt: Date.now(),
      });

      // 自动保存非中性策略
      if (finalScoring.direction !== 'neutral') {
        try {
          saveStrategy({
            symbol,
            timeframe: activeTimeframe,
            direction: finalScoring.direction as 'long' | 'short',
            probability: finalScoring.probability,
            entryPrice: ticker.price,
            stopLoss: risk.stopLoss,
            target1: risk.target1,
            target2: risk.target2,
            target3: risk.target3,
          });
        } catch {
          // 不影响主流程
        }
      }

      setResult(finalResult);
      setLoading(false);
    } catch (err: any) {
      // 被 abort 的请求不更新错误状态
      if (err?.name === 'AbortError' || signal.aborted) return;
      setError(err?.message || '分析失败，请检查网络连接后重试');
      setLoading(false);
    }
  }, []);

  /** reset 仅清空当前展示结果，不清空跨币种缓存（切币种时调用） */
  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  /**
   * 获取缓存结果：
   * - 命中且未超过 TTL → 返回 { result, isExpired: false, cachedAt }
   * - 命中但已超过 TTL → 返回 { result, isExpired: true, cachedAt }（可选择展示旧数据）
   * - 未命中 → 返回 null
   */
  const getCached = useCallback((symbol: Symbol, timeframe: Timeframe): {
    result: AnalysisResult;
    isExpired: boolean;
    cachedAt: number;
  } | null => {
    const entry = cacheRef.current.get(`${symbol}_${timeframe}`);
    if (!entry) return null;
    const isExpired = Date.now() - entry.cachedAt > CACHE_TTL_MS;
    return { result: entry.result, isExpired, cachedAt: entry.cachedAt };
  }, []);

  /** 强制清除指定 key 的缓存（用于手动重新分析） */
  const invalidateCache = useCallback((symbol: Symbol, timeframe: Timeframe) => {
    cacheRef.current.delete(`${symbol}_${timeframe}`);
  }, []);

  return { result, loading, steps, error, analyze, reset, getCached, invalidateCache };
}
