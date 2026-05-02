import axios from 'axios';
import { SentimentData } from '../types';
import { getCache, setCache } from '../utils/cache';
import { getFearGreedLabel } from '../utils/formatters';

export async function fetchFearGreed(): Promise<{ current: number; yesterday: number }> {
  const cacheKey = 'fear_greed';
  const cached = getCache<{ current: number; yesterday: number }>(cacheKey);
  if (cached) return cached;

  const resp = await axios.get('/api/fng/fng/?limit=2');
  const data = resp.data.data;
  const result = {
    current: parseInt(data[0]?.value ?? '50'),
    yesterday: parseInt(data[1]?.value ?? '50'),
  };
  setCache(cacheKey, result, 600);
  return result;
}

export async function buildSentimentData(fundingRate: number): Promise<SentimentData> {
  const fg = await fetchFearGreed();
  const change = fg.current - fg.yesterday;

  return {
    fearGreed: fg.current,
    fearGreedPrev: fg.yesterday,
    fearGreedChange: change,
    fearGreedLabel: getFearGreedLabel(fg.current),
    fundingRate,
    fundingRateAlert: Math.abs(fundingRate) > 0.001,
  };
}
