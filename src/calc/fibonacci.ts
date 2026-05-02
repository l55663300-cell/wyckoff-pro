import { KLine, FibonacciLevels } from '../types';

const RETRACEMENT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
const EXTENSION_LEVELS = [1.0, 1.272, 1.414, 1.618, 2.0, 2.618];

export function calcFibonacci(klines: KLine[], lookback = 100): FibonacciLevels {
  if (klines.length < 20) {
    const last = klines[klines.length - 1]?.close ?? 0;
    return {
      high: last, low: last,
      retracements: RETRACEMENT_LEVELS.map((l) => ({ level: l, price: last, label: `${(l * 100).toFixed(1)}%` })),
      extensions: EXTENSION_LEVELS.map((l) => ({ level: l, price: last, label: `${l.toFixed(3)}` })),
    };
  }

  const recent = klines.slice(-Math.min(lookback, klines.length));
  const high = Math.max(...recent.map((k) => k.high));
  const low = Math.min(...recent.map((k) => k.low));
  const diff = high - low;

  const retracements = RETRACEMENT_LEVELS.map((level) => ({
    level,
    price: high - diff * level,
    label: `${(level * 100).toFixed(1)}%`,
  }));

  const extensions = EXTENSION_LEVELS.map((level) => ({
    level,
    price: low + diff * level,
    label: `${level.toFixed(3)}`,
  }));

  return { high, low, retracements, extensions };
}

export function getFibEntryZone(fib: FibonacciLevels): { low: number; high: number } {
  const r382 = fib.retracements.find((r) => r.level === 0.382)?.price ?? fib.low;
  const r618 = fib.retracements.find((r) => r.level === 0.618)?.price ?? fib.low;
  return { low: Math.min(r382, r618), high: Math.max(r382, r618) };
}

export function getFibTargets(fib: FibonacciLevels): { t1: number; t2: number; t3: number } {
  const e1272 = fib.extensions.find((e) => e.level === 1.272)?.price ?? fib.high;
  const e1618 = fib.extensions.find((e) => e.level === 1.618)?.price ?? fib.high;
  const e2618 = fib.extensions.find((e) => e.level === 2.618)?.price ?? fib.high;
  return { t1: e1272, t2: e1618, t3: e2618 };
}
