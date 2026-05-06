import { getCache, setCache } from '../utils/cache';

export interface TrendingCoin {
  id: string;
  name: string;
  symbol: string;
  thumb: string;
  rank: number;                // 热搜排名 1-7
  priceUsd: number | null;
  priceChangePercent24h: number | null; // 24h 涨跌幅
  marketCapRank: number | null;
  score: number;               // CoinGecko score
}

export interface TrendingSentiment {
  bullishCount: number;        // 24h 涨幅 > 0 的数量
  bearishCount: number;
  avgChange: number;           // 平均涨跌幅
  verdict: 'bullish' | 'bearish' | 'neutral';
  verdictLabel: string;
  verdictDesc: string;
}

export interface TrendingResult {
  coins: TrendingCoin[];
  sentiment: TrendingSentiment;
  updatedAt: number;
}

const CACHE_KEY = 'trending_v1';
const CACHE_TTL = 10 * 60; // 10分钟

export async function fetchTrending(): Promise<TrendingResult> {
  const cached = getCache<TrendingResult>(CACHE_KEY);
  if (cached) return cached;

  // Step 1: 获取热搜榜
  const trendResp = await fetch(
    'https://api.coingecko.com/api/v3/search/trending',
    { signal: AbortSignal.timeout(8000) }
  );
  if (!trendResp.ok) throw new Error(`CoinGecko trending 失败: ${trendResp.status}`);
  const trendData = await trendResp.json() as {
    coins: Array<{
      item: {
        id: string;
        name: string;
        symbol: string;
        thumb: string;
        market_cap_rank: number | null;
        score: number;
        data?: {
          price: number | string;
          price_change_percentage_24h?: { usd?: number };
        };
      };
    }>;
  };

  const coins: TrendingCoin[] = trendData.coins.slice(0, 7).map((c, i) => {
    const item = c.item;
    const priceRaw = item.data?.price;
    const priceUsd = priceRaw != null ? parseFloat(String(priceRaw)) : null;
    const change = item.data?.price_change_percentage_24h?.usd ?? null;
    return {
      id: item.id,
      name: item.name,
      symbol: item.symbol.toUpperCase(),
      thumb: item.thumb,
      rank: i + 1,
      priceUsd: priceUsd && !isNaN(priceUsd) ? priceUsd : null,
      priceChangePercent24h: change,
      marketCapRank: item.market_cap_rank,
      score: item.score,
    };
  });

  // Step 2: 计算情绪
  const withChange = coins.filter(c => c.priceChangePercent24h != null);
  const bullishCount = withChange.filter(c => (c.priceChangePercent24h ?? 0) > 0).length;
  const bearishCount = withChange.filter(c => (c.priceChangePercent24h ?? 0) < 0).length;
  const avgChange = withChange.length > 0
    ? withChange.reduce((s, c) => s + (c.priceChangePercent24h ?? 0), 0) / withChange.length
    : 0;

  let verdict: TrendingSentiment['verdict'];
  let verdictLabel: string;
  let verdictDesc: string;

  if (avgChange > 2) {
    verdict = 'bullish';
    verdictLabel = '偏多';
    verdictDesc = `热搜 ${coins.length} 个币种平均涨幅 +${avgChange.toFixed(1)}%，市场热度偏乐观`;
  } else if (avgChange < -2) {
    verdict = 'bearish';
    verdictLabel = '偏空';
    verdictDesc = `热搜 ${coins.length} 个币种平均跌幅 ${avgChange.toFixed(1)}%，市场热度偏悲观`;
  } else {
    verdict = 'neutral';
    verdictLabel = '中性';
    verdictDesc = `热搜 ${coins.length} 个币种平均涨跌 ${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(1)}%，热度情绪中性`;
  }

  const sentiment: TrendingSentiment = {
    bullishCount,
    bearishCount,
    avgChange,
    verdict,
    verdictLabel,
    verdictDesc,
  };

  const result: TrendingResult = { coins, sentiment, updatedAt: Date.now() };
  setCache(CACHE_KEY, result, CACHE_TTL);
  return result;
}
