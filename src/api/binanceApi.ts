import axios from 'axios';
import { KLine, Symbol, Timeframe } from '../types';
import { getCache, setCache } from '../utils/cache';

// ─── Proxy prefixes (vite.config.ts 中配置) ───────────────────────────────────
const BN  = '/api/binance';   // https://api.binance.com
const BNF = '/api/fapi';      // https://fapi.binance.com
const OKX = '/api/okx';       // https://www.okx.com
const GATE = '/api/gate';     // https://api.gateio.ws

const TF_BN: Record<Timeframe, string>   = { '1d':'1d',  '4h':'4h',  '1h':'1h',  '15m':'15m' };
const TF_OKX: Record<Timeframe, string>  = { '1d':'1D',  '4h':'4H',  '1h':'1H',  '15m':'15m' };
const TF_GATE: Record<Timeframe, string> = { '1d':'1d',  '4h':'4h',  '1h':'1h',  '15m':'15m' };

// OKX: BTCUSDT → BTC-USDT
function toOkx(sym: string) { return sym.slice(0, -4) + '-' + sym.slice(-4); }
// Gate: BTCUSDT → BTC_USDT
function toGate(sym: string) { return sym.slice(0, -4) + '_' + sym.slice(-4); }

/**
 * 校验单根 K线数据的合法性：
 * - 所有 OHLCV 均为有限正数
 * - high >= low，high >= open/close，low <= open/close
 * - openTime 为合法时间戳（大于 2010-01-01）
 */
function isValidKline(k: KLine): boolean {
  const { openTime, open, high, low, close, volume } = k;
  if (!isFinite(open) || !isFinite(high) || !isFinite(low) || !isFinite(close) || !isFinite(volume)) return false;
  if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0) return false;
  if (high < low || high < open || high < close || low > open || low > close) return false;
  if (openTime < 1_262_304_000_000) return false; // < 2010-01-01
  return true;
}

/** 过滤并校验 K线数组，不足 10 根时抛出异常 */
function validateKlines(klines: KLine[], source: string): KLine[] {
  const valid = klines.filter(isValidKline);
  if (valid.length < 10) {
    throw new Error(`${source} 返回有效K线不足（仅 ${valid.length} 根），数据异常`);
  }
  return valid;
}

// ─── K线 ─────────────────────────────────────────────────────────────────────
export async function fetchKlines(symbol: Symbol, timeframe: Timeframe, limit = 500): Promise<KLine[]> {
  const cacheKey = `klines_${symbol}_${timeframe}`;
  const cached = getCache<KLine[]>(cacheKey);
  if (cached) return cached;

  // ① Binance
  try {
    const resp = await axios.get(`${BN}/api/v3/klines`, {
      params: { symbol, interval: TF_BN[timeframe], limit },
      timeout: 6000,
    });
    if (Array.isArray(resp.data) && resp.data.length) {
      const raw: KLine[] = resp.data.map((row: unknown) => {
        const r = row as unknown[];
        if (!Array.isArray(r) || r.length < 7) throw new Error('Binance K线格式异常');
        return {
          openTime:  Number(r[0]),
          open:      parseFloat(r[1] as string),
          high:      parseFloat(r[2] as string),
          low:       parseFloat(r[3] as string),
          close:     parseFloat(r[4] as string),
          volume:    parseFloat(r[5] as string),
          closeTime: Number(r[6]),
        };
      });
      const klines = validateKlines(raw, 'Binance');
      setCache(cacheKey, klines, 180);
      return klines;
    }
  } catch { /* fall through */ }

  // ② OKX
  try {
    const resp = await axios.get(`${OKX}/api/v5/market/candles`, {
      params: { instId: toOkx(symbol), bar: TF_OKX[timeframe], limit },
      timeout: 6000,
    });
    const data = resp.data?.data as string[][];
    if (Array.isArray(data) && data.length) {
      const raw: KLine[] = data.map((r) => {
        if (!Array.isArray(r) || r.length < 6) throw new Error('OKX K线格式异常');
        return {
          openTime:  parseInt(r[0]),
          open:      parseFloat(r[1]),
          high:      parseFloat(r[2]),
          low:       parseFloat(r[3]),
          close:     parseFloat(r[4]),
          volume:    parseFloat(r[5]),
          closeTime: parseInt(r[0]) + 60000,
        };
      }).reverse();
      const klines = validateKlines(raw, 'OKX');
      setCache(cacheKey, klines, 180);
      return klines;
    }
  } catch { /* fall through */ }

  // ③ Gate
  try {
    const resp = await axios.get(`${GATE}/api/v4/spot/candlesticks`, {
      params: { currency_pair: toGate(symbol), interval: TF_GATE[timeframe], limit },
      timeout: 6000,
    });
    const data = resp.data as string[][];
    if (Array.isArray(data) && data.length) {
      const raw: KLine[] = data.map((r) => {
        if (!Array.isArray(r) || r.length < 6) throw new Error('Gate K线格式异常');
        return {
          openTime:  parseInt(r[0]) * 1000,
          open:      parseFloat(r[5]),
          high:      parseFloat(r[3]),
          low:       parseFloat(r[4]),
          close:     parseFloat(r[2]),
          volume:    parseFloat(r[1]),
          closeTime: parseInt(r[0]) * 1000 + 60000,
        };
      });
      const klines = validateKlines(raw, 'Gate');
      setCache(cacheKey, klines, 180);
      return klines;
    }
  } catch { /* fall through */ }

  throw new Error(`无法获取 ${symbol} K线数据（Binance/OKX/Gate 均不可用）`);
}

// ─── 资金费率 ─────────────────────────────────────────────────────────────────
export async function fetchFundingRate(symbol: Symbol): Promise<number> {
  const cacheKey = `funding_${symbol}`;
  const cached = getCache<number>(cacheKey);
  if (cached !== null) return cached;

  // ① Binance Futures
  try {
    const resp = await axios.get(`${BNF}/fapi/v1/fundingRate`, {
      params: { symbol, limit: 1 }, timeout: 5000,
    });
    const rate = parseFloat(resp.data[0]?.fundingRate ?? '0');
    setCache(cacheKey, rate, 300);
    return rate;
  } catch { /* fall through */ }

  // ② OKX Swap
  try {
    const resp = await axios.get(`${OKX}/api/v5/public/funding-rate`, {
      params: { instId: toOkx(symbol).replace('-USDT', '-USDT-SWAP') }, timeout: 5000,
    });
    const rate = parseFloat(resp.data?.data?.[0]?.fundingRate ?? '0');
    setCache(cacheKey, rate, 300);
    return rate;
  } catch { /* fall through */ }

  return 0;
}

// ─── 24h 行情 ─────────────────────────────────────────────────────────────────
export async function fetchTicker24h(symbol: Symbol): Promise<{ price: number; priceChange24h: number }> {
  const cacheKey = `ticker_${symbol}`;
  const cached = getCache<{ price: number; priceChange24h: number }>(cacheKey);
  if (cached) return cached;

  // ① Binance
  try {
    const resp = await axios.get(`${BN}/api/v3/ticker/24hr`, {
      params: { symbol }, timeout: 5000,
    });
    if (resp.data?.lastPrice) {
      const result = {
        price: parseFloat(resp.data.lastPrice),
        priceChange24h: parseFloat(resp.data.priceChangePercent),
      };
      setCache(cacheKey, result, 30);
      return result;
    }
  } catch { /* fall through */ }

  // ② OKX
  try {
    const resp = await axios.get(`${OKX}/api/v5/market/ticker`, {
      params: { instId: toOkx(symbol) }, timeout: 5000,
    });
    const t = resp.data?.data?.[0];
    if (t) {
      const price = parseFloat(t.last);
      const open = parseFloat(t.open24h);
      const result = {
        price,
        priceChange24h: open > 0 ? ((price - open) / open * 100) : 0,
      };
      setCache(cacheKey, result, 30);
      return result;
    }
  } catch { /* fall through */ }

  // ③ Gate
  try {
    const resp = await axios.get(`${GATE}/api/v4/spot/tickers`, {
      params: { currency_pair: toGate(symbol) }, timeout: 5000,
    });
    const t = resp.data?.[0];
    if (t) {
      const result = {
        price: parseFloat(t.last),
        priceChange24h: parseFloat(t.change_percentage ?? '0'),
      };
      setCache(cacheKey, result, 30);
      return result;
    }
  } catch { /* fall through */ }

  throw new Error(`无法获取 ${symbol} 行情数据`);
}
