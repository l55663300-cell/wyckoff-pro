import React from 'react';
import { ScoringResult } from '../../types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ScoringCardProps {
  scoring: ScoringResult;
}

const DIRECTION_CONFIG = {
  long: {
    label: '建议做多',
    icon: TrendingUp,
    color: '#00C896',
    bg: 'rgba(0,200,150,0.10)',
    border: 'rgba(0,200,150,0.25)',
    barColor: 'linear-gradient(90deg, #00A878, #00C896)',
  },
  short: {
    label: '建议做空',
    icon: TrendingDown,
    color: '#FF4D6A',
    bg: 'rgba(255,77,106,0.10)',
    border: 'rgba(255,77,106,0.25)',
    barColor: 'linear-gradient(90deg, #CC1E38, #FF4D6A)',
  },
  neutral: {
    label: '建议观望',
    icon: Minus,
    color: '#A0A8B8',
    bg: 'rgba(92,100,120,0.10)',
    border: 'rgba(92,100,120,0.25)',
    barColor: 'linear-gradient(90deg, #3C4455, #5C6478)',
  },
};

const TF_LABELS: Record<string, string> = {
  '1d': '日线',
  '4h': '4小时',
  '1h': '1小时',
  '15m': '15分钟',
};

export const ScoringCard: React.FC<ScoringCardProps> = ({ scoring }) => {
  const dir = DIRECTION_CONFIG[scoring.direction];
  const Icon = dir.icon;

  const probColor = scoring.probability >= 70
    ? '#00C896'
    : scoring.probability >= 55
    ? '#FFB020'
    : '#FF4D6A';

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3" style={{ background: dir.bg, borderBottom: `1px solid ${dir.border}` }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${dir.color}20`, border: `1px solid ${dir.color}40` }}>
          <Icon size={16} style={{ color: dir.color }} />
        </div>
        <div className="flex-1">
          <div className="font-bold text-base text-white leading-none">{dir.label}</div>
          <div style={{ color: '#5C6478', fontSize: '10px', marginTop: '2px', letterSpacing: '0.04em' }}>多周期共振 · 综合评分</div>
        </div>
        <div className="text-right">
          <div className="font-mono font-bold text-2xl num-display" style={{ color: probColor }}>{scoring.probability}<span style={{ fontSize: '14px' }}>%</span></div>
          <div style={{ color: '#5C6478', fontSize: '10px' }}>概率</div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Timeframe breakdown */}
        <div className="space-y-2.5">
          {scoring.breakdown.map((b) => {
            const bColor = b.score > 0 ? '#00C896' : b.score < 0 ? '#FF4D6A' : '#5C6478';
            const barW = Math.abs(b.score) / 5 * 100;
            return (
              <div key={b.timeframe}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold" style={{ color: '#A0A8B8', minWidth: '48px' }}>{TF_LABELS[b.timeframe] || b.label}</span>
                    <span style={{ color: '#5C6478', fontSize: '10px' }}>权重 {(b.weight * 100).toFixed(0)}%</span>
                  </div>
                  <span className="font-mono font-bold text-sm" style={{ color: bColor }}>
                    {b.score > 0 ? '+' : ''}{b.score}
                  </span>
                </div>
                <div className="level-bar">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${barW / 2}%`,
                      marginLeft: b.score >= 0 ? '50%' : `${50 - barW / 2}%`,
                      background: b.score > 0
                        ? 'linear-gradient(90deg, #00A878, #00C896)'
                        : b.score < 0
                        ? 'linear-gradient(90deg, #CC1E38, #FF4D6A)'
                        : '#3C4455',
                    }}
                  />
                  {/* Center line */}
                  <div className="absolute top-0 bottom-0 w-px" style={{ left: '50%', background: 'rgba(255,255,255,0.15)', zIndex: 1 }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Signals */}
        {scoring.signals.length > 0 && (
          <div>
            <div className="section-title mb-2">触发信号</div>
            <div className="flex flex-wrap gap-1.5">
              {scoring.signals.map((sig, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-lg badge-warn font-medium">{sig}</span>
              ))}
            </div>
          </div>
        )}

        {/* Total score bar */}
        <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center justify-between mb-2">
            <span style={{ color: '#5C6478', fontSize: '11px' }}>综合得分</span>
            <span className="font-mono font-bold text-sm" style={{ color: scoring.score > 0 ? '#00C896' : '#FF4D6A' }}>
              {scoring.score > 0 ? '+' : ''}{scoring.score.toFixed(1)} / 10
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="absolute top-0 bottom-0 w-px" style={{ left: '50%', background: 'rgba(255,255,255,0.2)', zIndex: 1 }} />
            <div className="h-full rounded-full progress-bar absolute"
              style={{
                left: scoring.score >= 0 ? '50%' : `${((scoring.score + 10) / 20) * 100}%`,
                width: `${Math.abs(scoring.score) / 10 * 50}%`,
                background: scoring.score >= 0 ? dir.barColor : 'linear-gradient(90deg, #CC1E38, #FF4D6A)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
