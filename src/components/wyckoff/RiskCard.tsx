import React from 'react';
import { RiskPlan, Direction, Symbol } from '../../types';
import { formatPrice } from '../../utils/formatters';
import { Shield, Target, Clock, TrendingUp } from 'lucide-react';

interface RiskCardProps {
  risk: RiskPlan;
  direction: Direction;
  symbol: Symbol;
}

export const RiskCard: React.FC<RiskCardProps> = ({ risk, direction, symbol }) => {
  const isLong = direction === 'long';
  const isShort = direction === 'short';
  const isNeutral = direction === 'neutral';

  const prices = isLong
    ? [
        { label: '激进止盈', price: risk.target3, color: '#4D9FFF', pct: '20%', icon: '🎯' },
        { label: '理想止盈', price: risk.target2, color: '#00D4AA', pct: '30%', icon: '✨' },
        { label: '保守止盈', price: risk.target1, color: '#00C896', pct: '50%', icon: '✅' },
        { label: '入场区间', price: risk.entryHigh, color: '#E6E9F0', pct: '', icon: '⬇️', isEntry: true },
        { label: '入场区间', price: risk.entryLow, color: '#E6E9F0', pct: '', icon: '', isEntry: true, isEntryLow: true },
        { label: '动态止损', price: risk.stopLoss, color: '#FF4D6A', pct: '', icon: '🛑' },
      ]
    : isShort
    ? [
        { label: '动态止损', price: risk.stopLoss, color: '#FF4D6A', pct: '', icon: '🛑' },
        { label: '入场区间', price: risk.entryHigh, color: '#E6E9F0', pct: '', icon: '', isEntry: true },
        { label: '入场区间', price: risk.entryLow, color: '#E6E9F0', pct: '', icon: '⬇️', isEntry: true, isEntryLow: true },
        { label: '保守止盈', price: risk.target1, color: '#00C896', pct: '50%', icon: '✅' },
        { label: '理想止盈', price: risk.target2, color: '#00D4AA', pct: '30%', icon: '✨' },
        { label: '激进止盈', price: risk.target3, color: '#4D9FFF', pct: '20%', icon: '🎯' },
      ]
    : [];

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <Shield size={15} style={{ color: '#00D4AA' }} />
        <span className="font-bold text-base text-white">动态风控计划</span>
        {!isNeutral && (
          <div className="ml-auto flex items-center gap-2">
            <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ background: 'rgba(77,159,255,0.15)', color: '#4D9FFF', border: '1px solid rgba(77,159,255,0.25)' }}>
              R:R {risk.riskReward.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        {isNeutral ? (
          <div className="flex flex-col items-center justify-center py-6" style={{ color: '#5C6478' }}>
            <span className="text-3xl mb-2">👀</span>
            <div className="font-semibold text-base" style={{ color: '#A0A8B8' }}>建议观望</div>
            <div className="text-sm mt-1">当前信号不明确，等待更好的入场机会</div>
          </div>
        ) : (
          <>
            {/* Price levels visual */}
            <div className="space-y-1.5">
              {prices.map((item, i) => {
                if (item.isEntryLow) return null; // merge with entry high
                if (item.isEntry) {
                  // Entry zone
                  return (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(230,233,240,0.06)', border: '1px solid rgba(230,233,240,0.12)' }}>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span style={{ color: '#A0A8B8', fontSize: '12px', fontWeight: '500' }}>⬇️ 入场区间</span>
                          <span className="font-mono font-bold text-sm" style={{ color: '#E6E9F0' }}>
                            ${formatPrice(risk.entryLow, symbol)} — ${formatPrice(risk.entryHigh, symbol)}
                          </span>
                        </div>
                        <div style={{ color: '#5C6478', fontSize: '10px', marginTop: '2px' }}>斐波那契61.8%回撤 + 高成交量节点</div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: `${item.color}08`, border: `1px solid ${item.color}20` }}>
                    <span className="text-base w-6 text-center">{item.icon}</span>
                    <div className="flex-1">
                      <span style={{ color: '#A0A8B8', fontSize: '11px' }}>{item.label}</span>
                      {item.pct && <span className="ml-2 text-xs px-1.5 py-0.5 rounded badge-neutral">{item.pct}仓</span>}
                    </div>
                    <span className="font-mono font-bold text-sm num-display" style={{ color: item.color }}>
                      ${formatPrice(item.price, symbol)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-xl text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ color: '#5C6478', fontSize: '10px' }}>仓位</div>
                <div className="font-mono font-bold text-sm" style={{ color: '#00D4AA' }}>{risk.positionSize}%</div>
              </div>
              <div className="p-2.5 rounded-xl text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ color: '#5C6478', fontSize: '10px' }}>杠杆</div>
                <div className="font-mono font-bold text-sm" style={{ color: '#4D9FFF' }}>{risk.leverage}x</div>
              </div>
              <div className="p-2.5 rounded-xl text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ color: '#5C6478', fontSize: '10px' }}>盈亏比</div>
                <div className="font-mono font-bold text-sm" style={{ color: '#FFB020' }}>{risk.riskReward.toFixed(2)}</div>
              </div>
            </div>

            {/* Time stop */}
            <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'rgba(255,176,32,0.06)', border: '1px solid rgba(255,176,32,0.15)' }}>
              <Clock size={13} style={{ color: '#FFB020' }} />
              <div className="flex-1">
                <span style={{ color: '#FFB020', fontSize: '12px', fontWeight: '500' }}>时间止损</span>
                <span style={{ color: '#A0A8B8', fontSize: '11px', marginLeft: '8px' }}>入场后 {risk.timeStopHours} 小时内未突破成本区 ±0.5% → 平仓</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
