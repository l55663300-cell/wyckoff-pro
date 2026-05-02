# 威科夫Pro 网页版 - 优化需求文档

> 生成时间：2026-04-22  
> 项目路径：/Users/liyunfei/CodeBuddy/Claw/wyckoff-pro  
> 当前版本：v1.0  
> 目标版本：v2.0

---

## 📋 优化需求清单

### 1. 接入消息面数据（RSS新闻）

**目标**：补充技术面分析，提供双轮驱动策略

**实现方案**：

#### 1.1 数据源
- **CoinTelegraph RSS**: `https://cointelegraph.com/rss`
- **CoinDesk RSS**: `https://coindesk.com/arc/outboundfeeds/rss/`

#### 1.2 技术实现

**新增文件**: `src/api/newsApi.ts`

```typescript
// src/api/newsApi.ts
import axios from 'axios';

export interface NewsItem {
  title: string;
  pubDate: string;
  link: string;
  description?: string;
}

/**
 * 抓取 RSS 新闻（通过代理服务，避免 CORS）
 * 推荐使用 rss2json.com 或自建后端代理
 */
export async function fetchCryptoNews(limit: number = 10): Promise<NewsItem[]> {
  try {
    // 方案1：使用 rss2json.com 免费服务
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
 * 分析新闻情绪（简单关键词匹配）
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

#### 1.3 UI 组件

**新增组件**: `src/components/news/NewsPanel.tsx`

```typescript
// src/components/news/NewsPanel.tsx
import React, { useEffect, useState } from 'react';
import { fetchCryptoNews, NewsItem, analyzeNewsSentiment } from '../../api/newsApi';

export function NewsPanel() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [sentiment, setSentiment] = useState({ bullish: 0, bearish: 0, neutral: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNews();
  }, []);

  async function loadNews() {
    setLoading(true);
    const items = await fetchCryptoNews(10);
    setNews(items);
    setSentiment(analyzeNewsSentiment(items));
    setLoading(false);
  }

  if (loading) return <div className="animate-pulse">加载新闻中...</div>;

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">📰 最新资讯</h3>
        <div className="flex gap-2 text-sm">
          <span className="text-green-400">📈 {sentiment.bullish}</span>
          <span className="text-red-400">📉 {sentiment.bearish}</span>
          <span className="text-gray-400">➖ {sentiment.neutral}</span>
        </div>
      </div>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {news.map((item, idx) => (
          <a
            key={idx}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-2 hover:bg-slate-700 rounded text-sm"
          >
            <div className="font-medium text-blue-400">{item.title}</div>
            <div className="text-xs text-gray-500 mt-1">
              {new Date(item.pubDate).toLocaleString('zh-CN')}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
```

#### 1.4 集成到主页面

在 `App.tsx` 中添加：

```typescript
import { NewsPanel } from './components/news/NewsPanel';

// 在主布局中添加
<div className="grid grid-cols-3 gap-4">
  <div className="col-span-2">
    {/* 原有的图表和分析 */}
  </div>
  <div className="col-span-1">
    <NewsPanel />
  </div>
</div>
```

---

### 2. 扩展多标的支持（SOL / BNB / XRP）

**目标**：从 ETH/BTC 扩展到 5 个主流币种

#### 2.1 修改类型定义

**文件**: `src/types/index.ts`

```typescript
// 原有
export type Symbol = 'ETHUSDT' | 'BTCUSDT';

// 修改为
export type Symbol = 'ETHUSDT' | 'BTCUSDT' | 'SOLUSDT' | 'BNBUSDT' | 'XRPUSDT';
```

#### 2.2 更新 Header 组件

**文件**: `src/components/layout/Header.tsx`

```typescript
const SYMBOLS: { key: Symbol; label: string; icon: string }[] = [
  { key: 'ETHUSDT', label: 'ETH', icon: '💎' },
  { key: 'BTCUSDT', label: 'BTC', icon: '₿' },
  { key: 'SOLUSDT', label: 'SOL', icon: '☀️' },
  { key: 'BNBUSDT', label: 'BNB', icon: '🟡' },
  { key: 'XRPUSDT', label: 'XRP', icon: '💧' },
];

// 在 UI 中渲染
<div className="flex gap-2">
  {SYMBOLS.map(s => (
    <button
      key={s.key}
      className={`px-3 py-1 rounded ${symbol === s.key ? 'bg-blue-600' : 'bg-slate-700'}`}
      onClick={() => onSymbolChange(s.key)}
    >
      {s.icon} {s.label}
    </button>
  ))}
</div>
```

#### 2.3 调整风控参数

不同币种波动率不同，需要调整 ATR 系数：

**文件**: `src/calc/riskControl.ts`

```typescript
const SYMBOL_RISK_CONFIG: Record<Symbol, { atrMultiplier: number; basePosition: number }> = {
  ETHUSDT: { atrMultiplier: 2.0, basePosition: 0.02 },
  BTCUSDT: { atrMultiplier: 2.0, basePosition: 0.02 },
  SOLUSDT: { atrMultiplier: 2.5, basePosition: 0.015 }, // SOL 波动更大
  BNBUSDT: { atrMultiplier: 2.2, basePosition: 0.018 },
  XRPUSDT: { atrMultiplier: 2.8, basePosition: 0.012 }, // XRP 波动最大
};

// 在计算止损时使用
const config = SYMBOL_RISK_CONFIG[symbol];
const stopLoss = entryPrice - atr * config.atrMultiplier;
```

---

### 3. 添加策略历史胜率统计

**目标**：让用户看到策略的实战有效性

#### 3.1 数据存储

**新增文件**: `src/utils/strategyHistory.ts`

```typescript
// src/utils/strategyHistory.ts
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
  // 回测结果（用户手动标记或自动追踪）
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

#### 3.2 UI 组件

**新增组件**: `src/components/report/WinRatePanel.tsx`

```typescript
// src/components/report/WinRatePanel.tsx
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
      <h3 className="text-lg font-semibold mb-4">📊 策略胜率统计</h3>
      
      <div className="grid grid-cols-2 gap-4">
        {/* 全局统计 */}
        <div className="bg-slate-700 rounded p-3">
          <div className="text-sm text-gray-400 mb-2">全局统计</div>
          <div className="text-2xl font-bold text-green-400">
            {overall.winRate.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {overall.wins}胜 / {overall.losses}负 / {overall.totalTrades}总
          </div>
          <div className="text-xs text-blue-400 mt-1">
            平均收益: {overall.avgProfit.toFixed(2)}%
          </div>
        </div>
        
        {/* 当前标的统计 */}
        <div className="bg-slate-700 rounded p-3">
          <div className="text-sm text-gray-400 mb-2">
            {symbol} {timeframe} (30天)
          </div>
          <div className="text-2xl font-bold text-blue-400">
            {current.winRate.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {current.wins}胜 / {current.losses}负 / {current.totalTrades}总
          </div>
          <div className="text-xs text-blue-400 mt-1">
            平均收益: {current.avgProfit.toFixed(2)}%
          </div>
        </div>
      </div>
      
      <div className="mt-4 text-xs text-gray-500">
        💡 提示：在策略面板中标记实战结果，系统会自动统计胜率
      </div>
    </div>
  );
}
```

#### 3.3 集成到策略生成

在生成策略后，自动保存记录：

```typescript
// 在 useAnalysis hook 中
import { saveStrategy } from '../utils/strategyHistory';

// 分析完成后
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

### 4. 添加"距离下次刷新"倒计时

**目标**：让用户知道数据刷新进度

#### 4.1 实现倒计时 Hook

**新增文件**: `src/hooks/useCountdown.ts`

```typescript
// src/hooks/useCountdown.ts
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

#### 4.2 UI 组件

**新增组件**: `src/components/RefreshCountdown.tsx`

```typescript
// src/components/RefreshCountdown.tsx
import React, { useEffect } from 'react';
import { useCountdown } from '../hooks/useCountdown';

interface Props {
  intervalMs: number; // 例如 15 * 60 * 1000 (15分钟)
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
    <div className="flex items-center gap-3 bg-slate-800 rounded-lg px-4 py-2">
      <div className="text-sm text-gray-400">下次刷新:</div>
      <div className="font-mono text-lg font-semibold text-blue-400">
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </div>
      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
```

#### 4.3 集成到 App

在 `App.tsx` 中：

```typescript
import { RefreshCountdown } from './components/RefreshCountdown';

// 在 Header 或顶部添加
<RefreshCountdown
  intervalMs={15 * 60 * 1000} // 15分钟
  enabled={autoRefresh}
  onRefresh={() => handleAnalyze()}
/>
```

---

### 5. 流动性热力图（挂单热力图）

**目标**：可视化订单簿深度，识别大单墙和支撑/阻力

#### 5.1 数据获取

**新增文件**: `src/api/orderBookApi.ts`

```typescript
// src/api/orderBookApi.ts
import axios from 'axios';

export interface OrderBookLevel {
  price: number;
  quantity: number;
  total: number; // 累计量
}

export interface OrderBook {
  bids: OrderBookLevel[]; // 买单
  asks: OrderBookLevel[]; // 卖单
  timestamp: number;
}

/**
 * 获取订单簿深度数据
 * @param symbol 交易对
 * @param limit 深度级别（默认100档）
 */
export async function fetchOrderBook(
  symbol: string,
  limit: number = 100
): Promise<OrderBook> {
  const response = await axios.get(
    `https://fapi.binance.com/fapi/v1/depth`,
    {
      params: { symbol, limit }
    }
  );

  const data = response.data;
  
  // 处理买单（降序）
  let bidTotal = 0;
  const bids: OrderBookLevel[] = data.bids.map(([price, qty]: [string, string]) => {
    const p = parseFloat(price);
    const q = parseFloat(qty);
    bidTotal += q;
    return { price: p, quantity: q, total: bidTotal };
  });

  // 处理卖单（升序）
  let askTotal = 0;
  const asks: OrderBookLevel[] = data.asks.map(([price, qty]: [string, string]) => {
    const p = parseFloat(price);
    const q = parseFloat(qty);
    askTotal += q;
    return { price: p, quantity: q, total: askTotal };
  });

  return {
    bids,
    asks,
    timestamp: Date.now()
  };
}

/**
 * 识别大单墙（订单簿异常集中区域）
 */
export function detectBigWalls(
  orderBook: OrderBook,
  threshold: number = 2.0 // 超过平均量的倍数
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

#### 5.2 热力图组件

**新增组件**: `src/components/chart/OrderBookHeatmap.tsx`

```typescript
// src/components/chart/OrderBookHeatmap.tsx
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
    const interval = setInterval(loadOrderBook, 5000); // 每5秒更新
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
    return <div className="animate-pulse h-64 bg-slate-700 rounded" />;
  }

  // 计算最大量（用于归一化）
  const maxQty = Math.max(
    ...orderBook.bids.map(b => b.quantity),
    ...orderBook.asks.map(a => a.quantity)
  );

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4">🔥 订单簿热力图</h3>
      
      <div className="space-y-1">
        {/* 卖单（红色） */}
        <div className="space-y-0.5">
          {orderBook.asks.slice(0, 20).reverse().map((ask, idx) => {
            const intensity = (ask.quantity / maxQty) * 100;
            const isWall = walls.askWalls.some(w => w.price === ask.price);
            return (
              <div
                key={idx}
                className="flex items-center gap-2 text-xs h-5 relative"
              >
                <div className="w-20 text-right font-mono text-red-400">
                  ${ask.price.toFixed(2)}
                </div>
                <div className="flex-1 relative h-full">
                  <div
                    className={`absolute right-0 h-full transition-all ${
                      isWall ? 'bg-red-600' : 'bg-red-500/50'
                    }`}
                    style={{ width: `${intensity}%` }}
                  />
                  {isWall && (
                    <div className="absolute right-1 text-white font-bold">
                      🧱 {ask.quantity.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 当前价格分隔线 */}
        <div className="flex items-center gap-2 py-2 border-y border-yellow-500/50">
          <div className="w-20 text-right font-mono text-yellow-400 font-bold">
            ${currentPrice.toFixed(2)}
          </div>
          <div className="flex-1 text-xs text-yellow-400">
            ← 当前价格
          </div>
        </div>

        {/* 买单（绿色） */}
        <div className="space-y-0.5">
          {orderBook.bids.slice(0, 20).map((bid, idx) => {
            const intensity = (bid.quantity / maxQty) * 100;
            const isWall = walls.bidWalls.some(w => w.price === bid.price);
            return (
              <div
                key={idx}
                className="flex items-center gap-2 text-xs h-5 relative"
              >
                <div className="w-20 text-right font-mono text-green-400">
                  ${bid.price.toFixed(2)}
                </div>
                <div className="flex-1 relative h-full">
                  <div
                    className={`absolute left-0 h-full transition-all ${
                      isWall ? 'bg-green-600' : 'bg-green-500/50'
                    }`}
                    style={{ width: `${intensity}%` }}
                  />
                  {isWall && (
                    <div className="absolute left-1 text-white font-bold">
                      🧱 {bid.quantity.toFixed(2)}
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
        <div className="mt-4 p-3 bg-yellow-500/10 rounded border border-yellow-500/30">
          <div className="text-sm font-semibold text-yellow-400 mb-2">
            🧱 检测到大单墙
          </div>
          {walls.bidWalls.length > 0 && (
            <div className="text-xs text-green-400 mb-1">
              买单墙: {walls.bidWalls.map(w => `$${w.price.toFixed(2)}`).join(', ')}
              （强支撑）
            </div>
          )}
          {walls.askWalls.length > 0 && (
            <div className="text-xs text-red-400">
              卖单墙: {walls.askWalls.map(w => `$${w.price.toFixed(2)}`).join(', ')}
              （强阻力）
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

#### 5.3 策略集成（大单墙 + 威科夫）

**文件**: `src/calc/scoring.ts`

在评分系统中整合订单簿信号：

```typescript
import { detectBigWalls, OrderBook } from '../api/orderBookApi';

export function calculateScore(
  // ... 现有参数
  orderBook?: OrderBook,
  currentPrice?: number
): ScoringResult {
  let score = 0;
  
  // ... 原有评分逻辑
  
  // 新增：订单簿信号
  if (orderBook && currentPrice) {
    const walls = detectBigWalls(orderBook);
    
    // 如果当前价格接近买单墙（支撑），加分
    const nearBidWall = walls.bidWalls.some(
      w => Math.abs(w.price - currentPrice) / currentPrice < 0.005 // 0.5%范围内
    );
    if (nearBidWall) {
      score += 2; // 强支撑信号
    }
    
    // 如果当前价格接近卖单墙（阻力），减分
    const nearAskWall = walls.askWalls.some(
      w => Math.abs(w.price - currentPrice) / currentPrice < 0.005
    );
    if (nearAskWall) {
      score -= 2; // 强阻力信号
    }
  }
  
  // ... 继续原有逻辑
  
  return { score, direction, probability };
}
```

---

### 6. v2.3 三段式简报格式

**目标**：统一策略输出格式，提升可读性

#### 6.1 格式规范

**新增文件**: `src/utils/reportFormatter.ts`

```typescript
// src/utils/reportFormatter.ts
import { AnalysisResult } from '../types';

export function formatV23Report(result: AnalysisResult): string {
  const { symbol, price, wyckoff, scoring, risk, sentiment, news } = result;
  
  const timestamp = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  // 1. 市场状态
  const marketState = `
### 📊 市场状态 — 核心结论

**${symbol}** @ $${price} | **阶段**：${wyckoff.phase} | **形态**：${wyckoff.pattern || '无'}
**量价**：${wyckoff.volumePriceMatch} | **环境**：ADX ${risk.adx.toFixed(0)} (${risk.adx > 25 ? '强趋势' : '震荡'}) | ATR ${risk.atr.toFixed(0)}

**复合人动向**：${wyckoff.compositeManBehavior}
`.trim();

  // 2. 交易计划
  const tradingPlan = `
### 🎯 交易计划 — 概率 ${scoring.probability}% (${scoring.direction === 'long' ? '做多' : scoring.direction === 'short' ? '做空' : '观望'})

- **入场区**：$${risk.entryLow} - $${risk.entryHigh} *(注：${risk.fibRetrace}% @ $${risk.fibRetracePrice} 回撤位 + POC $${risk.poc})*
- **止损**：$${risk.stopLoss} (ATR×2动态)
- **止盈**：
  - 保守(50%) @ $${risk.target1} *(1.272扩展)*
  - 理想(30%) @ $${risk.target2} *(1.618扩展)*
  - 移动(20%) 跟踪止损

**仓位**：${risk.positionSize}% (30x) | **风控**：时间止损 16h
`.trim();

  // 3. 决策依据
  const reasoning = `
### 🔑 决策依据

1. **威科夫**：${wyckoff.reasoning}
2. **斐波那契+成交量**：${risk.volumeReasoning}
3. **情绪/消息**：${sentiment.summary} ${news[0]?.title || ''}
`.trim();

  // 4. 异动关注
  const alerts = `
### 📌 今日异动关注

${news.slice(0, 3).map(n => `- **${n.title}** - ${n.description || ''}`).join('\n')}
`.trim();

  return `
🦞【威科夫Pro · 简报】${timestamp}

---
${marketState}

---
${tradingPlan}

---
${reasoning}

---
${alerts}

---

_数据驱动，逻辑为王 🦞_
`.trim();
}
```

#### 6.2 应用到报告面板

**文件**: `src/components/report/ReportPanel.tsx`

```typescript
import { formatV23Report } from '../../utils/reportFormatter';

export function ReportPanel({ result }: { result: AnalysisResult }) {
  const reportText = formatV23Report(result);
  
  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <pre className="whitespace-pre-wrap text-sm font-mono">
        {reportText}
      </pre>
      <button
        className="mt-4 px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
        onClick={() => navigator.clipboard.writeText(reportText)}
      >
        📋 复制策略
      </button>
    </div>
  );
}
```

---

## 🚀 实施步骤

### 第一阶段（核心功能）
1. ✅ 接入 RSS 新闻（CoinTelegraph + CoinDesk）
2. ✅ 扩展多标的（SOL / BNB / XRP）
3. ✅ 添加刷新倒计时

### 第二阶段（增强功能）
4. ✅ 策略历史胜率统计
5. ✅ 订单簿热力图
6. ✅ v2.3 格式化输出

### 第三阶段（优化迭代）
7. 性能优化（WebSocket 实时数据）
8. 移动端适配
9. 数据持久化（云端同步）

---

## 📦 依赖包

需要安装的新依赖：

```bash
npm install axios
# axios 用于 RSS 和订单簿数据抓取
```

---

## 🧪 测试建议

### 功能测试
- RSS 新闻加载是否正常
- 多标的切换是否流畅
- 倒计时是否准确
- 订单簿热力图是否实时更新

### 性能测试
- 多个组件同时刷新时是否卡顿
- 订单簿数据量大时的渲染性能

### 兼容性测试
- 不同浏览器（Chrome / Safari / Firefox）
- 移动端（iOS / Android）

---

## 📝 注意事项

1. **CORS 问题**
   - RSS 抓取需要通过代理（rss2json.com）
   - 订单簿 API 直接调用 Binance，无 CORS

2. **API 频率限制**
   - Binance 订单簿：建议 5 秒刷新一次
   - RSS 新闻：建议 10 分钟刷新一次

3. **数据存储**
   - 策略历史使用 localStorage（最大 5MB）
   - 如需更多存储，考虑 IndexedDB

4. **错误处理**
   - 所有 API 调用需 try-catch
   - 失败时显示友好提示，不阻塞主流程

---

## 🎯 预期效果

完成后的系统将具备：

✅ **技术面**：威科夫 + 斐波那契 + 成交量 + 订单簿  
✅ **消息面**：实时新闻 + 情绪分析  
✅ **多标的**：5 个主流币种（ETH/BTC/SOL/BNB/XRP）  
✅ **用户体验**：倒计时 + 胜率统计 + 一键复制策略  
✅ **可视化**：K线图 + 热力图 + 成交量柱状图  

成为一个**真正可实战的专业交易分析系统**！🦞🚀

---

**文档生成时间**：2026-04-22 10:35  
**作者**：威科夫Pro 🦞  
**版本**：v2.0 优化需求文档
