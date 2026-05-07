/**
 * strategyHistory — 策略历史记录
 * v2: localStorage 主存（快速读写）+ 异步同步 Supabase strategy_history 表
 */

import { supabase } from '../lib/supabase';
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
  result?: 'win' | 'loss' | 'breakeven' | 'pending';
  exitPrice?: number;
  profitPercent?: number;
  closeTime?: number;
}

const STORAGE_KEY = 'wyckoff_strategy_history';

// ─── localStorage 读写 ────────────────────────────────────────────────────────

export function loadHistory(): StrategyRecord[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function _saveHistory(history: StrategyRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

// ─── 写入新记录 ───────────────────────────────────────────────────────────────

export function saveStrategy(
  record: Omit<StrategyRecord, 'id' | 'timestamp' | 'result'> & { uid?: string },
): void {
  const history = loadHistory();
  const newRecord: StrategyRecord = {
    ...record,
    id: Date.now().toString(),
    timestamp: Date.now(),
    result: 'pending',
  };
  history.push(newRecord);
  _saveHistory(history.slice(-200));

  // 异步同步到 Supabase（需要传入 uid 才同步）
  if (record.uid) {
    void supabase.from('strategy_history').insert({
      id: newRecord.id,
      uid: record.uid,
      symbol: newRecord.symbol,
      timeframe: newRecord.timeframe,
      direction: newRecord.direction,
      probability: newRecord.probability,
      entry_price: newRecord.entryPrice,
      stop_loss: newRecord.stopLoss,
      target1: newRecord.target1,
      target2: newRecord.target2,
      target3: newRecord.target3,
      result: newRecord.result,
      timestamp: newRecord.timestamp,
      created_at: new Date(newRecord.timestamp).toISOString(),
    }).then(({ error }) => {
      if (error) console.error('[strategyHistory] Supabase 写入失败:', error.message);
    });
  }
}

// ─── 更新结果 ─────────────────────────────────────────────────────────────────

export function updateStrategyResult(
  id: string,
  result: 'win' | 'loss' | 'breakeven',
  exitPrice: number,
): void {
  const history = loadHistory();
  const record = history.find((r) => r.id === id);
  if (record) {
    record.result = result;
    record.exitPrice = exitPrice;
    record.closeTime = Date.now();
    record.profitPercent = ((exitPrice - record.entryPrice) / record.entryPrice) * 100;
    if (record.direction === 'short') record.profitPercent *= -1;
    _saveHistory(history);

    // 异步更新 Supabase
    void supabase.from('strategy_history').update({
      result,
      exit_price: exitPrice,
      profit_percent: record.profitPercent,
      close_time: record.closeTime,
    }).eq('id', id).then(({ error }) => {
      if (error) console.error('[strategyHistory] Supabase 更新失败:', error.message);
    });
  }
}

// ─── 从 Supabase 加载用户历史（跨设备同步） ──────────────────────────────────

export async function fetchStrategyHistory(uid: string): Promise<StrategyRecord[]> {
  try {
    const { data, error } = await supabase
      .from('strategy_history')
      .select('*')
      .eq('uid', uid)
      .order('created_at', { ascending: false })
      .limit(200);
    if (!error && data && data.length > 0) {
      const records: StrategyRecord[] = data.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        timestamp: Number(row.timestamp),
        symbol: row.symbol as Symbol,
        timeframe: row.timeframe as Timeframe,
        direction: row.direction as 'long' | 'short',
        probability: Number(row.probability),
        entryPrice: Number(row.entry_price),
        stopLoss: Number(row.stop_loss),
        target1: Number(row.target1),
        target2: Number(row.target2),
        target3: Number(row.target3),
        result: (row.result as StrategyRecord['result']) ?? 'pending',
        exitPrice: row.exit_price != null ? Number(row.exit_price) : undefined,
        profitPercent: row.profit_percent != null ? Number(row.profit_percent) : undefined,
        closeTime: row.close_time != null ? Number(row.close_time) : undefined,
      }));
      // 同步到 localStorage
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch {}
      return records;
    }
  } catch (e) {
    console.warn('[strategyHistory] fetchStrategyHistory 失败，降级到 localStorage:', e);
  }
  return loadHistory();
}

// ─── 统计分析 ─────────────────────────────────────────────────────────────────

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
  let history = loadHistory().filter((r) => r.result !== 'pending');

  if (filter?.symbol) history = history.filter((r) => r.symbol === filter.symbol);
  if (filter?.timeframe) history = history.filter((r) => r.timeframe === filter.timeframe);
  if (filter?.days) {
    const cutoff = Date.now() - filter.days * 24 * 60 * 60 * 1000;
    history = history.filter((r) => r.timestamp > cutoff);
  }

  const wins = history.filter((r) => r.result === 'win').length;
  const losses = history.filter((r) => r.result === 'loss').length;
  const totalTrades = history.length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  const totalProfit = history.reduce((sum, r) => sum + (r.profitPercent || 0), 0);
  const avgProfit = totalTrades > 0 ? totalProfit / totalTrades : 0;

  return { totalTrades, wins, losses, winRate, avgProfit };
}
