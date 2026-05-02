import React, { useState } from 'react';
import { Trophy, TrendingUp, TrendingDown, BookOpen } from 'lucide-react';
import { calculateWinRate, loadHistory, updateStrategyResult } from '../../utils/strategyHistory';
import { Symbol, Timeframe } from '../../types';

interface Props {
  symbol: Symbol;
  timeframe: Timeframe;
}

export function WinRatePanel({ symbol, timeframe }: Props) {
  const [refresh, setRefresh] = useState(0);

  const overall = calculateWinRate();
  const current = calculateWinRate({ symbol, timeframe, days: 30 });
  const pending = loadHistory().filter((r) => r.result === 'pending').slice(-3);

  const handleMark = (id: string, result: 'win' | 'loss') => {
    const record = loadHistory().find((r) => r.id === id);
    if (!record) return;
    const price = result === 'win' ? record.target1 : record.stopLoss;
    updateStrategyResult(id, result, price);
    setRefresh((v) => v + 1);
  };

  const winColor = (rate: number) =>
    rate >= 60 ? '#02C076' : rate >= 45 ? '#F0B90B' : '#F6465D';

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(14,18,30,0.85)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center gap-2"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
      >
        <Trophy size={14} style={{ color: '#F0B90B' }} />
        <span className="font-bold text-sm text-white">策略胜率</span>
      </div>

      <div className="p-4 space-y-3">
        {/* 全局统计 */}
        <div
          className="p-3 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div style={{ color: '#5C6478', fontSize: '10px', marginBottom: '6px' }}>全局累计</div>
          <div className="flex items-end justify-between">
            <div
              className="font-mono font-bold text-3xl"
              style={{ color: winColor(overall.winRate) }}
            >
              {overall.totalTrades > 0 ? `${overall.winRate.toFixed(0)}%` : '--'}
            </div>
            <div className="text-right">
              <div style={{ fontSize: '11px', color: '#A0A8B8' }}>
                {overall.wins}胜 / {overall.losses}负
              </div>
              <div
                className="font-mono text-xs"
                style={{ color: overall.avgProfit >= 0 ? '#02C076' : '#F6465D', marginTop: '2px' }}
              >
                均盈 {overall.avgProfit >= 0 ? '+' : ''}{overall.avgProfit.toFixed(1)}%
              </div>
            </div>
          </div>
          {overall.totalTrades > 0 && (
            <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${overall.winRate}%`,
                  background: `linear-gradient(90deg, ${winColor(overall.winRate)}80, ${winColor(overall.winRate)})`,
                }}
              />
            </div>
          )}
        </div>

        {/* 当前标的30天统计 */}
        <div
          className="p-3 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div style={{ color: '#5C6478', fontSize: '10px', marginBottom: '6px' }}>
            {symbol.replace('USDT', '')} · {timeframe} · 近30天
          </div>
          <div className="flex items-end justify-between">
            <div
              className="font-mono font-bold text-3xl"
              style={{ color: winColor(current.winRate) }}
            >
              {current.totalTrades > 0 ? `${current.winRate.toFixed(0)}%` : '--'}
            </div>
            <div className="text-right">
              <div style={{ fontSize: '11px', color: '#A0A8B8' }}>
                {current.wins}胜 / {current.losses}负
              </div>
              <div
                className="font-mono text-xs"
                style={{ color: current.avgProfit >= 0 ? '#02C076' : '#F6465D', marginTop: '2px' }}
              >
                均盈 {current.avgProfit >= 0 ? '+' : ''}{current.avgProfit.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        {/* 待确认的最近信号 */}
        {pending.length > 0 && (
          <div>
            <div
              className="flex items-center gap-1.5 mb-2"
              style={{ color: '#5C6478', fontSize: '10px' }}
            >
              <BookOpen size={10} />
              标记实战结果
            </div>
            <div className="space-y-1.5">
              {pending.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 p-2 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div style={{ color: r.direction === 'long' ? '#02C076' : '#F6465D', fontSize: '11px', fontWeight: '600' }}>
                      {r.direction === 'long' ? '↑ 多' : '↓ 空'} {r.symbol.replace('USDT', '')} {r.timeframe}
                    </div>
                    <div className="font-mono" style={{ color: '#5C6478', fontSize: '10px' }}>
                      ${r.entryPrice.toFixed(2)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleMark(r.id, 'win')}
                    className="px-2 py-0.5 rounded-lg text-xs font-bold cursor-pointer transition-all"
                    style={{ background: 'rgba(2,192,118,0.12)', color: '#02C076', border: '1px solid rgba(2,192,118,0.25)' }}
                  >
                    <TrendingUp size={10} />
                  </button>
                  <button
                    onClick={() => handleMark(r.id, 'loss')}
                    className="px-2 py-0.5 rounded-lg text-xs font-bold cursor-pointer transition-all"
                    style={{ background: 'rgba(246,70,93,0.12)', color: '#F6465D', border: '1px solid rgba(246,70,93,0.25)' }}
                  >
                    <TrendingDown size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {overall.totalTrades === 0 && (
          <div
            className="text-center py-3 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.02)', color: '#5C6478', fontSize: '11px' }}
          >
            💡 运行分析后自动记录信号<br />标记结果即可统计胜率
          </div>
        )}
      </div>
    </div>
  );
}
