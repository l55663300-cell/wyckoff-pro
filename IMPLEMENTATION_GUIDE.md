# 威科夫Pro v2.0 - 完整实施指南

> **布局方案**：经典三栏式（方案A）  
> **生成时间**：2026-04-22  
> **项目路径**：/Users/liyunfei/CodeBuddy/Claw/wyckoff-pro  
> **实施难度**：⭐⭐⭐ (中等)

---

## 📐 方案A：经典三栏式布局

### 布局结构图
```
┌────────────────────────────────────────────────┐
│ Header: 标的切换 ETH|BTC|SOL + 周期 + 倒计时     │
├────────────────────────────────────────────────┤
│ 左(50%)          │ 中(30%)      │ 右(20%)      │
│ ┌──────────────┐ │ ┌─────────┐ │ ┌─────────┐ │
│ │              │ │ │ 策略简报 │ │ │ 胜率统计 │ │
│ │   K线图      │ │ │ --------│ │ └─────────┘ │
│ │   (大图)     │ │ │ 做多 70% │ │ ┌─────────┐ │
│ │              │ │ │ 入场2300 │ │ │ 最新新闻 │ │
│ └──────────────┘ │ │ 止损2270 │ │ │ -------- │ │
│ ┌──────────────┐ │ └─────────┘ │ │ 📰 BTC   │ │
│ │ 订单簿热力图   │ │ ┌─────────┐ │ │ 📰 ETH   │ │
│ │ 买单墙/卖单墙  │ │ │威科夫指标│ │ │ 📰 SOL   │ │
│ └──────────────┘ │ └─────────┘ │ └─────────┘ │
└──────────────────┴─────────────┴─────────────┘
```

---

## 🎯 实施步骤总览

### 第一阶段：布局重构
- [ ] 1. 修改 App.tsx 主布局
- [ ] 2. 调整组件位置和大小

### 第二阶段：功能实现
- [ ] 3. RSS 新闻模块
- [ ] 4. 多标的扩展（SOL/BNB/XRP）
- [ ] 5. 策略历史胜率统计
- [ ] 6. 刷新倒计时
- [ ] 7. 订单簿热力图
- [ ] 8. v2.3 简报格式

### 第三阶段：测试部署
- [ ] 9. 本地测试
- [ ] 10. 部署到 Vercel

---

## 📦 第一阶段：布局重构

### 1.1 修改 App.tsx 主布局

**文件**: `src/App.tsx`

```tsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Symbol, Timeframe } from './types';
import { useAnalysis } from './hooks/useAnalysis';

// 组件导入
import { Header } from './components/layout/Header';
import { CandlestickChart } from './components/chart/CandlestickChart';
import { OrderBookHeatmap } from './components/chart/OrderBookHeatmap';
import { ReportPanel } from './components/report/ReportPanel';
import { WyckoffPanel } from './components/wyckoff/WyckoffPanel';
import { WinRatePanel } from './components/report/WinRatePanel';
import { NewsPanel } from './components/news/NewsPanel';
import { RefreshCountdown } from './components/RefreshCountdown';
import { LoadingOverlay } from './components/LoadingOverlay';

const AUTO_REFRESH_INTERVAL = 15 * 60 * 1000; // 15分钟

export default function App() {
  const [symbol, setSymbol] = useState<Symbol>('ETHUSDT');
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>('1h');
  const [autoRefresh, setAutoRefresh] = useState(false);
  
  const { result, loading, error, analyze } = useAnalysis();

  const handleAnalyze = useCallback(() => {
    analyze(symbol, activeTimeframe);
  }, [analyze, symbol, activeTimeframe]);

  const handleTimeframeChange = useCallback((tf: Timeframe) => {
    setActiveTimeframe(tf);
    analyze(symbol, tf);
  }, [analyze, symbol]);

  const handleSymbolChange = useCallback((s: Symbol) => {
    setSymbol(s);
    analyze(s, activeTimeframe);
  }, [analyze, activeTimeframe]);

  // 首次加载自动分析
  useEffect(() => {
    handleAnalyze();
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <Header
        symbol={symbol}
        timeframe={activeTimeframe}
        onSymbolChange={handleSymbolChange}
        onTimeframeChange={handleTimeframeChange}
        onAnalyze={handleAnalyze}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
      />

      {/* 刷新倒计时 */}
      <div className="container mx-auto px-4 py-4">
        <RefreshCountdown
          intervalMs={AUTO_REFRESH_INTERVAL}
          enabled={autoRefresh}
          onRefresh={handleAnalyze}
        />
      </div>

      {/* 主布局：三栏式 */}
      <div className="container mx-auto px-4 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
          
          {/* 左栏：图表区 (50% = 5/10) */}
          <div className="lg:col-span-5 space-y-4">
            {/* K线图 */}
            <div className="bg-slate-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4">📊 K线图</h3>
              {result && (
                <CandlestickChart
                  symbol={symbol}
                  timeframe={activeTimeframe}
                  height={400}
                />
              )}
            </div>

            {/* 订单簿热力图 */}
            <div>
              {result && (
                <OrderBookHeatmap
                  symbol={symbol}
                  currentPrice={result.price}
                />
              )}
            </div>
          </div>

          {/* 中栏：策略+指标 (30% = 3/10) */}
          <div className="lg:col-span-3 space-y-4">
            {/* 策略简报 */}
            {result && (
              <ReportPanel result={result} />
            )}

            {/* 威科夫指标 */}
            {result && (
              <WyckoffPanel result={result} />
            )}
          </div>

          {/* 右栏：统计+新闻 (20% = 2/10) */}
          <div className="lg:col-span-2 space-y-4">
            {/* 胜率统计 */}
            <WinRatePanel
              symbol={symbol}
              timeframe={activeTimeframe}
            />

            {/* 最新新闻 */}
            <NewsPanel />
          </div>
        </div>
      </div>

      {/* 加载遮罩 */}
      {loading && <LoadingOverlay />}

      {/* 错误提示 */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
```

---

## 📰 第二阶段-功能1：RSS 新闻模块

### 1. 新增 API 文件

**文件**: `src/api/newsApi.ts`

```typescript
import axios from 'axios';

export interface NewsItem {
  title: string;
  pubDate: string;
  link: string;
  description?: string;
}

/**
 * 抓取加密货币新闻
 */
export async function fetchCryptoNews(limit: number = 10): Promise<NewsItem[]> {
  try {
    const rssUrls = [
      'https://cointelegraph.com/rss',
      'https://coindesk.com/arc/outboundfeeds/rss/'
    ];
    
    const allNews: NewsItem[] = [];
    
    for (const rssUrl of rssUrls) {
      const response = await axios.get(
        `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`
      );
      
      if (response.data.status === 'ok') {
        const items = response.data.items.slice(0, limit).map((item: any) => ({
          title: item.title,
          pubDate: item.pubDate,
          link: item.link,
          description: item.description
        }));
        allNews.push(...items);
      }
    }
    
    // 按时间倒序
    allNews.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    
    return allNews.slice(0, limit);
  } catch (error) {
    console.error('Failed to fetch news:', error);
    return [];
  }
}

/**
 * 分析新闻情绪
 */
export function analyzeNewsSentiment(news: NewsItem[]): {
  bullish: number;
  bearish: number;
  neutral: number;
} {
  const bullishKeywords = ['surge', 'rally', 'bull', 'breakout', 'pump', 'adoption', 'institutional'];
  const bearishKeywords = ['crash', 'drop', 'bear', 'hack', 'exploit', 'regulation', 'ban'];
  
  let bullish = 0, bearish = 0, neutral = 0;
  
  news.forEach(item => {
    const text = (item.title + ' ' + (item.description || '')).toLowerCase();
    const hasBullish = bullishKeywords.some(kw => text.includes(kw));
    const hasBearish = bearishKeywords.some(kw => text.includes(kw));
    
    if (hasBullish && !hasBearish) bullish++;
    else if (hasBearish && !hasBullish) bearish++;
    else neutral++;
  });
  
  return { bullish, bearish, neutral };
}
```

### 2. 新增新闻面板组件

**文件**: `src/components/news/NewsPanel.tsx`

```tsx
import React, { useEffect, useState } from 'react';
import { fetchCryptoNews, NewsItem, analyzeNewsSentiment } from '../../api/newsApi';

export function NewsPanel() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [sentiment, setSentiment] = useState({ bullish: 0, bearish: 0, neutral: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNews();
    const interval = setInterval(loadNews, 10 * 60 * 1000); // 10分钟刷新
    return () => clearInterval(interval);
  }, []);

  async function loadNews() {
    setLoading(true);
    const items = await fetchCryptoNews(8);
    setNews(items);
    setSentiment(analyzeNewsSentiment(items));
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-slate-700 rounded w-3/4"></div>
          <div className="h-4 bg-slate-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">📰 最新资讯</h3>
        <div className="flex gap-2 text-xs">
          <span className="text-green-400">📈 {sentiment.bullish}</span>
          <span className="text-red-400">📉 {sentiment.bearish}</span>
          <span className="text-gray-400">➖ {sentiment.neutral}</span>
        </div>
      </div>
      
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {news.map((item, idx) => (
          <a
            key={idx}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <div className="font-medium text-sm text-blue-400 leading-snug mb-1">
              {item.title}
            </div>
            <div className="text-xs text-gray-500">
              {new Date(item.pubDate).toLocaleString('zh-CN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
```

---

## 🪙 第二阶段-功能2：多标的扩展

### 1. 修改类型定义

**文件**: `src/types/index.ts`

```typescript
// 从 2 个扩展到 5 个
export type Symbol = 'ETHUSDT' | 'BTCUSDT' | 'SOLUSDT' | 'BNBUSDT' | 'XRPUSDT';
```

### 2. 更新 Header 组件

**文件**: `src/components/layout/Header.tsx`

```tsx
import React from 'react';
import { Symbol, Timeframe } from '../../types';

const SYMBOLS: { key: Symbol; label: string; icon: string }[] = [
  { key: 'ETHUSDT', label: 'ETH', icon: '💎' },
  { key: 'BTCUSDT', label: 'BTC', icon: '₿' },
  { key: 'SOLUSDT', label: 'SOL', icon: '☀️' },
  { key: 'BNBUSDT', label: 'BNB', icon: '🟡' },
  { key: 'XRPUSDT', label: 'XRP', icon: '💧' },
];

const TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: '1d', label: '日线' },
  { key: '4h', label: '4小时' },
  { key: '1h', label: '1小时' },
  { key: '15m', label: '15分钟' },
];

interface Props {
  symbol: Symbol;
  timeframe: Timeframe;
  onSymbolChange: (s: Symbol) => void;
  onTimeframeChange: (tf: Timeframe) => void;
  onAnalyze: () => void;
  autoRefresh: boolean;
  onAutoRefreshChange: (enabled: boolean) => void;
}

export function Header({
  symbol,
  timeframe,
  onSymbolChange,
  onTimeframeChange,
  onAnalyze,
  autoRefresh,
  onAutoRefreshChange
}: Props) {
  return (
    <header className="bg-slate-800 border-b border-slate-700 px-4 py-4">
      <div className="container mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4">
          
          {/* Logo + 标题 */}
          <div className="flex items-center gap-3">
            <div className="text-3xl">🦞</div>
            <div>
              <h1 className="text-xl font-bold">威科夫Pro</h1>
              <p className="text-xs text-gray-400">专业加密货币交易分析</p>
            </div>
          </div>

          {/* 标的切换 */}
          <div className="flex gap-2">
            {SYMBOLS.map(s => (
              <button
                key={s.key}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  symbol === s.key
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
                onClick={() => onSymbolChange(s.key)}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>

          {/* 周期切换 */}
          <div className="flex gap-2">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf.key}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                  timeframe === tf.key
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
                onClick={() => onTimeframeChange(tf.key)}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-3">
            {/* 自动刷新开关 */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => onAutoRefreshChange(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">自动刷新</span>
            </label>

            {/* 立即分析按钮 */}
            <button
              onClick={onAnalyze}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg"
            >
              🔄 分析
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
```

### 3. 调整风控参数

**文件**: `src/calc/riskControl.ts`

在现有文件中添加：

```typescript
import { Symbol } from '../types';

// 不同币种的风险配置
const SYMBOL_RISK_CONFIG: Record<Symbol, {
  atrMultiplier: number;
  basePosition: number;
}> = {
  ETHUSDT: { atrMultiplier: 2.0, basePosition: 0.02 },
  BTCUSDT: { atrMultiplier: 2.0, basePosition: 0.02 },
  SOLUSDT: { atrMultiplier: 2.5, basePosition: 0.015 }, // 波动更大
  BNBUSDT: { atrMultiplier: 2.2, basePosition: 0.018 },
  XRPUSDT: { atrMultiplier: 2.8, basePosition: 0.012 }, // 波动最大
};

// 在计算止损时使用
export function calculateStopLoss(
  symbol: Symbol,
  entryPrice: number,
  atr: number,
  direction: 'long' | 'short'
): number {
  const config = SYMBOL_RISK_CONFIG[symbol];
  const distance = atr * config.atrMultiplier;
  
  if (direction === 'long') {
    return entryPrice - distance;
  } else {
    return entryPrice + distance;
  }
}

// 在计算仓位时使用
export function calculatePositionSize(
  symbol: Symbol,
  adx: number
): number {
  const config = SYMBOL_RISK_CONFIG[symbol];
  let position = config.basePosition;
  
  // ADX > 25 强趋势，增加仓位
  if (adx > 25) {
    position *= 2; // 重仓
  } else if (adx < 20) {
    position *= 0.75; // 轻仓
  }
  
  return Math.min(position, 0.04); // 最大 4%
}
```

---

## 📊 第二阶段-功能3：策略历史胜率统计

### 1. 新增策略历史工具

**文件**: `src/utils/strategyHistory.ts`

```typescript
import { Symbol, Timeframe } from '../types';

export interface StrategyRecord {
  id: string;
  timestamp: number;
  symbol: Symbol;
  timeframe: Timeframe;
  direction: 'long' | 'short';
  probability: number;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  // 回测结果
  result?: 'win' | 'loss' | 'breakeven' | 'pending';
  exitPrice?: number;
  profitPercent?: number;
  closeTime?: number;
}

const STORAGE_KEY = 'wyckoff_strategy_history';

export function saveStrategy(record: Omit<StrategyRecord, 'id' | 'timestamp'>): void {
  const history = loadHistory();
  const newRecord: StrategyRecord = {
    ...record,
    id: Date.now().toString(),
    timestamp: Date.now(),
    result: 'pending'
  };
  history.push(newRecord);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function loadHistory(): StrategyRecord[] {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

export function updateStrategyResult(
  id: string,
  result: 'win' | 'loss' | 'breakeven',
  exitPrice: number
): void {
  const history = loadHistory();
  const record = history.find(r => r.id === id);
  if (record) {
    record.result = result;
    record.exitPrice = exitPrice;
    record.closeTime = Date.now();
    record.profitPercent = ((exitPrice - record.entryPrice) / record.entryPrice) * 100;
    if (record.direction === 'short') record.profitPercent *= -1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }
}

export function calculateWinRate(filter?: {
  symbol?: Symbol;
  timeframe?: Timeframe;
  days?: number;
}): {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgProfit: number;
} {
  let history = loadHistory().filter(r => r.result !== 'pending');
  
  // 应用过滤器
  if (filter?.symbol) history = history.filter(r => r.symbol === filter.symbol);
  if (filter?.timeframe) history = history.filter(r => r.timeframe === filter.timeframe);
  if (filter?.days) {
    const cutoff = Date.now() - filter.days * 24 * 60 * 60 * 1000;
    history = history.filter(r => r.timestamp > cutoff);
  }
  
  const wins = history.filter(r => r.result === 'win').length;
  const losses = history.filter(r => r.result === 'loss').length;
  const totalTrades = history.length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  
  const totalProfit = history.reduce((sum, r) => sum + (r.profitPercent || 0), 0);
  const avgProfit = totalTrades > 0 ? totalProfit / totalTrades : 0;
  
  return { totalTrades, wins, losses, winRate, avgProfit };
}
```

### 2. 新增胜率统计面板

**文件**: `src/components/report/WinRatePanel.tsx`

```tsx
import React from 'react';
import { calculateWinRate } from '../../utils/strategyHistory';
import { Symbol, Timeframe } from '../../types';

interface Props {
  symbol: Symbol;
  timeframe: Timeframe;
}

export function WinRatePanel({ symbol, timeframe }: Props) {
  const overall = calculateWinRate();
  const current = calculateWinRate({ symbol, timeframe, days: 30 });
  
  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4">📊 策略胜率</h3>
      
      <div className="space-y-3">
        {/* 全局统计 */}
        <div className="bg-slate-700 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-2">全局统计</div>
          <div className="flex items-end justify-between">
            <div className="text-3xl font-bold text-green-400">
              {overall.winRate.toFixed(0)}%
            </div>
            <div className="text-right text-xs text-gray-500">
              <div>{overall.wins}胜 / {overall.losses}负</div>
              <div className="text-blue-400 mt-1">
                平均 {overall.avgProfit >= 0 ? '+' : ''}{overall.avgProfit.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
        
        {/* 当前标的统计 */}
        <div className="bg-slate-700 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-2">
            {symbol} {timeframe} (30天)
          </div>
          <div className="flex items-end justify-between">
            <div className="text-3xl font-bold text-blue-400">
              {current.winRate.toFixed(0)}%
            </div>
            <div className="text-right text-xs text-gray-500">
              <div>{current.wins}胜 / {current.losses}负</div>
              <div className="text-blue-400 mt-1">
                平均 {current.avgProfit >= 0 ? '+' : ''}{current.avgProfit.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-3 text-xs text-gray-500 bg-slate-700/50 rounded p-2">
        💡 在策略面板标记实战结果，系统会自动统计胜率
      </div>
    </div>
  );
}
```

### 3. 自动保存策略记录

在 `useAnalysis` hook 中集成：

**文件**: `src/hooks/useAnalysis.ts`

```typescript
import { saveStrategy } from '../utils/strategyHistory';

// 在分析完成后
if (result && result.scoring.direction !== 'neutral') {
  saveStrategy({
    symbol: result.symbol,
    timeframe: result.timeframe,
    direction: result.scoring.direction as 'long' | 'short',
    probability: result.scoring.probability,
    entryPrice: result.price,
    stopLoss: result.risk.stopLoss,
    target1: result.risk.target1,
    target2: result.risk.target2,
    target3: result.risk.target3
  });
}
```

---

## ⏱️ 第二阶段-功能4：刷新倒计时

### 1. 新增倒计时 Hook

**文件**: `src/hooks/useCountdown.ts`

```typescript
import { useState, useEffect, useRef } from 'react';

export function useCountdown(totalMs: number, onComplete?: () => void) {
  const [remainingMs, setRemainingMs] = useState(totalMs);
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const start = () => {
    setIsRunning(true);
    startTimeRef.current = Date.now();
    setRemainingMs(totalMs);
    
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, totalMs - elapsed);
      setRemainingMs(remaining);
      
      if (remaining === 0) {
        stop();
        onComplete?.();
      }
    }, 100);
  };

  const stop = () => {
    setIsRunning(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const reset = () => {
    stop();
    setRemainingMs(totalMs);
  };

  useEffect(() => {
    return () => stop();
  }, []);

  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  const progress = ((totalMs - remainingMs) / totalMs) * 100;

  return {
    remainingMs,
    minutes,
    seconds,
    progress,
    isRunning,
    start,
    stop,
    reset
  };
}
```

### 2. 新增倒计时组件

**文件**: `src/components/RefreshCountdown.tsx`

```tsx
import React, { useEffect } from 'react';
import { useCountdown } from '../hooks/useCountdown';

interface Props {
  intervalMs: number;
  enabled: boolean;
  onRefresh: () => void;
}

export function RefreshCountdown({ intervalMs, enabled, onRefresh }: Props) {
  const { minutes, seconds, progress, isRunning, start, reset } = useCountdown(
    intervalMs,
    onRefresh
  );

  useEffect(() => {
    if (enabled && !isRunning) {
      start();
    } else if (!enabled && isRunning) {
      reset();
    }
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="flex items-center gap-4 bg-slate-800 rounded-lg px-6 py-3 shadow-lg">
      <div className="text-sm text-gray-400">下次刷新:</div>
      <div className="font-mono text-2xl font-bold text-blue-400 min-w-[80px]">
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </div>
      <div className="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="text-xs text-gray-500">
        {progress.toFixed(0)}%
      </div>
    </div>
  );
}
```

---

## 🔥 第二阶段-功能5：订单簿热力图

### 1. 新增订单簿 API

**文件**: `src/api/orderBookApi.ts`

```typescript
import axios from 'axios';

export interface OrderBookLevel {
  price: number;
  quantity: number;
  total: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export async function fetchOrderBook(
  symbol: string,
  limit: number = 100
): Promise<OrderBook> {
  const response = await axios.get(
    `https://fapi.binance.com/fapi/v1/depth`,
    { params: { symbol, limit } }
  );

  const data = response.data;
  
  let bidTotal = 0;
  const bids: OrderBookLevel[] = data.bids.map(([price, qty]: [string, string]) => {
    const p = parseFloat(price);
    const q = parseFloat(qty);
    bidTotal += q;
    return { price: p, quantity: q, total: bidTotal };
  });

  let askTotal = 0;
  const asks: OrderBookLevel[] = data.asks.map(([price, qty]: [string, string]) => {
    const p = parseFloat(price);
    const q = parseFloat(qty);
    askTotal += q;
    return { price: p, quantity: q, total: askTotal };
  });

  return { bids, asks, timestamp: Date.now() };
}

export function detectBigWalls(
  orderBook: OrderBook,
  threshold: number = 2.0
): {
  bidWalls: { price: number; quantity: number }[];
  askWalls: { price: number; quantity: number }[];
} {
  const avgBidQty = orderBook.bids.reduce((sum, b) => sum + b.quantity, 0) / orderBook.bids.length;
  const avgAskQty = orderBook.asks.reduce((sum, a) => sum + a.quantity, 0) / orderBook.asks.length;

  const bidWalls = orderBook.bids
    .filter(b => b.quantity > avgBidQty * threshold)
    .map(b => ({ price: b.price, quantity: b.quantity }));

  const askWalls = orderBook.asks
    .filter(a => a.quantity > avgAskQty * threshold)
    .map(a => ({ price: a.price, quantity: a.quantity }));

  return { bidWalls, askWalls };
}
```

### 2. 新增热力图组件

**文件**: `src/components/chart/OrderBookHeatmap.tsx`

```tsx
import React, { useEffect, useState, useMemo } from 'react';
import { fetchOrderBook, OrderBook, detectBigWalls } from '../../api/orderBookApi';
import { Symbol } from '../../types';

interface Props {
  symbol: Symbol;
  currentPrice: number;
}

export function OrderBookHeatmap({ symbol, currentPrice }: Props) {
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrderBook();
    const interval = setInterval(loadOrderBook, 5000); // 5秒更新
    return () => clearInterval(interval);
  }, [symbol]);

  async function loadOrderBook() {
    try {
      const data = await fetchOrderBook(symbol, 50);
      setOrderBook(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch order book:', error);
      setLoading(false);
    }
  }

  const walls = useMemo(() => {
    if (!orderBook) return { bidWalls: [], askWalls: [] };
    return detectBigWalls(orderBook, 2.0);
  }, [orderBook]);

  if (loading || !orderBook) {
    return (
      <div className="bg-slate-800 rounded-lg p-4">
        <div className="animate-pulse h-96 bg-slate-700 rounded"></div>
      </div>
    );
  }

  const maxQty = Math.max(
    ...orderBook.bids.map(b => b.quantity),
    ...orderBook.asks.map(a => a.quantity)
  );

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4">🔥 订单簿热力图</h3>
      
      <div className="space-y-0.5">
        {/* 卖单（红色） */}
        <div className="space-y-0.5">
          {orderBook.asks.slice(0, 20).reverse().map((ask, idx) => {
            const intensity = (ask.quantity / maxQty) * 100;
            const isWall = walls.askWalls.some(w => w.price === ask.price);
            return (
              <div key={idx} className="flex items-center gap-2 text-xs h-6 relative">
                <div className="w-24 text-right font-mono text-red-400 font-semibold">
                  ${ask.price.toFixed(2)}
                </div>
                <div className="flex-1 relative h-full">
                  <div
                    className={`absolute right-0 h-full transition-all ${
                      isWall ? 'bg-red-600' : 'bg-red-500/40'
                    }`}
                    style={{ width: `${intensity}%` }}
                  />
                  {isWall && (
                    <div className="absolute right-2 top-0.5 text-white text-xs font-bold">
                      🧱 {ask.quantity.toFixed(1)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 当前价格 */}
        <div className="flex items-center gap-2 py-2 my-1 border-y-2 border-yellow-500/70 bg-yellow-500/10">
          <div className="w-24 text-right font-mono text-yellow-400 font-bold text-lg">
            ${currentPrice.toFixed(2)}
          </div>
          <div className="flex-1 text-sm text-yellow-400 font-semibold">
            ← 当前价格
          </div>
        </div>

        {/* 买单（绿色） */}
        <div className="space-y-0.5">
          {orderBook.bids.slice(0, 20).map((bid, idx) => {
            const intensity = (bid.quantity / maxQty) * 100;
            const isWall = walls.bidWalls.some(w => w.price === bid.price);
            return (
              <div key={idx} className="flex items-center gap-2 text-xs h-6 relative">
                <div className="w-24 text-right font-mono text-green-400 font-semibold">
                  ${bid.price.toFixed(2)}
                </div>
                <div className="flex-1 relative h-full">
                  <div
                    className={`absolute left-0 h-full transition-all ${
                      isWall ? 'bg-green-600' : 'bg-green-500/40'
                    }`}
                    style={{ width: `${intensity}%` }}
                  />
                  {isWall && (
                    <div className="absolute left-2 top-0.5 text-white text-xs font-bold">
                      🧱 {bid.quantity.toFixed(1)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 大单墙提示 */}
      {(walls.bidWalls.length > 0 || walls.askWalls.length > 0) && (
        <div className="mt-4 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
          <div className="text-sm font-semibold text-yellow-400 mb-2">
            🧱 检测到大单墙
          </div>
          {walls.bidWalls.length > 0 && (
            <div className="text-xs text-green-400 mb-1">
              买单墙: {walls.bidWalls.slice(0, 3).map(w => `$${w.price.toFixed(2)}`).join(', ')}
              {walls.bidWalls.length > 3 && ` +${walls.bidWalls.length - 3}个`}
              （强支撑）
            </div>
          )}
          {walls.askWalls.length > 0 && (
            <div className="text-xs text-red-400">
              卖单墙: {walls.askWalls.slice(0, 3).map(w => `$${w.price.toFixed(2)}`).join(', ')}
              {walls.askWalls.length > 3 && ` +${walls.askWalls.length - 3}个`}
              （强阻力）
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## 📝 第二阶段-功能6：v2.3 简报格式

### 1. 新增格式化工具

**文件**: `src/utils/reportFormatter.ts`

```typescript
import { AnalysisResult } from '../types';

export function formatV23Report(result: AnalysisResult): string {
  const { symbol, price, wyckoff, scoring, risk, sentiment, news = [] } = result;
  
  const timestamp = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const direction = scoring.direction === 'long' ? '做多' : scoring.direction === 'short' ? '做空' : '观望';
  
  return `
🦞【威科夫Pro · 简报】${timestamp}

---
### 📊 市场状态 — 核心结论

**${symbol}** @ $${price} | **阶段**：${wyckoff.phase} | **形态**：${wyckoff.pattern || '无'}
**量价**：${wyckoff.volumePriceMatch || '中性'} | **环境**：ADX ${risk.adx?.toFixed(0) || 'N/A'} (${(risk.adx || 0) > 25 ? '强趋势' : '震荡'}) | ATR ${risk.atr?.toFixed(0) || 'N/A'}

**复合人动向**：${wyckoff.compositeManBehavior || '观望整理'}

---
### 🎯 交易计划 — 概率 ${scoring.probability}% (${direction})

- **入场区**：$${risk.entryLow} - $${risk.entryHigh} *(注：${risk.fibRetrace || 50}% @ $${risk.fibRetracePrice || risk.entryLow} 回撤位 + POC $${risk.poc || risk.entryLow})*
- **止损**：$${risk.stopLoss} (ATR×2动态)
- **止盈**：
  - 保守(50%) @ $${risk.target1} *(1.272扩展)*
  - 理想(30%) @ $${risk.target2} *(1.618扩展)*
  - 移动(20%) 跟踪止损

**仓位**：${risk.positionSize}% (30x) | **风控**：时间止损 16h

---
### 🔑 决策依据

1. **威科夫**：${wyckoff.reasoning || '技术形态分析中'}
2. **斐波那契+成交量**：${risk.volumeReasoning || '价格位于关键支撑/阻力区'}
3. **情绪/消息**：${sentiment.summary || '市场情绪中性'}${news[0] ? ` | ${news[0].title}` : ''}

---
### 📌 今日异动关注

${news.slice(0, 3).map(n => `- **${n.title}**${n.description ? ` - ${n.description.slice(0, 80)}...` : ''}`).join('\n') || '- 暂无重大新闻'}

---

_数据驱动，逻辑为王 🦞_
`.trim();
}
```

### 2. 更新报告面板

**文件**: `src/components/report/ReportPanel.tsx`

```tsx
import React, { useState } from 'react';
import { AnalysisResult } from '../../types';
import { formatV23Report } from '../../utils/reportFormatter';

interface Props {
  result: AnalysisResult;
}

export function ReportPanel({ result }: Props) {
  const [copied, setCopied] = useState(false);
  
  const reportText = formatV23Report(result);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const direction = result.scoring.direction === 'long' ? '做多' : 
                    result.scoring.direction === 'short' ? '做空' : '观望';
  const directionColor = result.scoring.direction === 'long' ? 'text-green-400' :
                         result.scoring.direction === 'short' ? 'text-red-400' : 'text-gray-400';
  
  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">🎯 策略简报</h3>
        <button
          onClick={handleCopy}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
            copied 
              ? 'bg-green-600 text-white' 
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {copied ? '✅ 已复制' : '📋 复制'}
        </button>
      </div>
      
      {/* 核心信息卡片 */}
      <div className="bg-slate-700 rounded-lg p-4 mb-4">
        <div className={`text-4xl font-bold ${directionColor} mb-2`}>
          {direction === '做多' ? '📈' : direction === '做空' ? '📉' : '➖'} {direction}
        </div>
        <div className="text-2xl font-semibold text-blue-400 mb-3">
          概率 {result.scoring.probability}%
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-gray-400">入场区</div>
            <div className="font-mono font-semibold">
              ${result.risk.entryLow} - ${result.risk.entryHigh}
            </div>
          </div>
          <div>
            <div className="text-gray-400">止损</div>
            <div className="font-mono font-semibold text-red-400">
              ${result.risk.stopLoss}
            </div>
          </div>
          <div>
            <div className="text-gray-400">保守止盈</div>
            <div className="font-mono font-semibold text-green-400">
              ${result.risk.target1}
            </div>
          </div>
          <div>
            <div className="text-gray-400">理想止盈</div>
            <div className="font-mono font-semibold text-green-400">
              ${result.risk.target2}
            </div>
          </div>
        </div>
      </div>
      
      {/* 完整报告（折叠） */}
      <details className="bg-slate-700/50 rounded-lg">
        <summary className="cursor-pointer p-3 text-sm font-medium hover:bg-slate-700 rounded">
          📄 查看完整报告
        </summary>
        <div className="p-3">
          <pre className="whitespace-pre-wrap text-xs font-mono leading-relaxed">
            {reportText}
          </pre>
        </div>
      </details>
    </div>
  );
}
```

---

## 🧪 第三阶段：测试与部署

### 1. 本地测试清单

```bash
# 安装依赖
npm install axios

# 启动开发服务器
npm run dev

# 测试项目
✅ 标的切换是否正常（ETH/BTC/SOL/BNB/XRP）
✅ 周期切换是否正常（1d/4h/1h/15m）
✅ 新闻加载是否正常
✅ 订单簿热力图是否实时更新
✅ 倒计时是否准确
✅ 胜率统计是否显示
✅ 策略复制是否成功
✅ 移动端布局是否正常
```

### 2. 部署到 Vercel

```bash
# 构建项目
npm run build

# 部署
npx vercel --prod

# 或者直接
vercel --prod --yes
```

### 3. 部署后验证

访问 `https://wyckoff-pro.vercel.app` 检查：
- ✅ 所有功能正常
- ✅ API 调用成功（无 CORS 错误）
- ✅ 页面加载速度正常
- ✅ 移动端响应式正常

---

## 📦 依赖包清单

```json
{
  "dependencies": {
    "axios": "^1.6.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "lightweight-charts": "^5.1.0",
    "recharts": "^3.8.1",
    "lucide-react": "^1.8.0",
    "tailwindcss": "^3.4.17"
  }
}
```

---

## 🎯 预期效果

完成后，你的威科夫Pro将拥有：

### ✅ 视觉效果
- **经典三栏布局**：左大右小，信息层级清晰
- **深色主题**：专业感强，长时间观看不累眼
- **实时热力图**：订单簿可视化，大单墙一目了然
- **响应式设计**：移动端/桌面端完美适配

### ✅ 功能完整
- **5个主流币种**：ETH/BTC/SOL/BNB/XRP
- **4个周期**：1d/4h/1h/15m
- **双轮驱动**：技术面 + 消息面
- **实战验证**：胜率统计 + 历史记录
- **用户友好**：倒计时 + 一键复制

### ✅ 性能优异
- **5秒刷新订单簿**
- **10分钟刷新新闻**
- **15分钟自动分析**
- **本地存储胜率数据**

---

## 🚀 开始实施

**下一步**：
1. 把这份文档发给 CodeBuddy
2. 让他按照步骤逐步实现
3. 每完成一个功能就测试验证
4. 全部完成后部署到 Vercel

**预计时间**：
- 布局重构：30分钟
- 功能实现：2-3小时
- 测试调试：30分钟
- 总计：**3-4小时**

---

## 📞 遇到问题？

如果遇到任何问题：
1. 检查浏览器控制台（F12）是否有错误
2. 检查 Binance API 是否可访问
3. 检查 rss2json.com 是否正常
4. 随时找我（威科夫Pro 🦞）！

---

**文档生成时间**：2026-04-22 10:52  
**作者**：威科夫Pro 🦞  
**版本**：v2.0 完整实施指南

祝实施顺利！🦞🚀
