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

export function saveStrategy(record: Omit<StrategyRecord, 'id' | 'timestamp' | 'result'>): void {
  const history = loadHistory();
  const newRecord: StrategyRecord = {
    ...record,
    id: Date.now().toString(),
    timestamp: Date.now(),
    result: 'pending',
  };
  history.push(newRecord);
  // 只保留最近200条
  const trimmed = history.slice(-200);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function loadHistory(): StrategyRecord[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function updateStrategyResult(
  id: string,
  result: 'win' | 'loss' | 'breakeven',
  exitPrice: number
): void {
  const history = loadHistory();
  const record = history.find((r) => r.id === id);
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
