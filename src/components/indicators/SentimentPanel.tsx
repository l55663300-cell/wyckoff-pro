import React from 'react';
import { SentimentData } from '../../types';
import { formatFundingRate, getFearGreedColor } from '../../utils/formatters';

interface SentimentPanelProps {
  sentiment: SentimentData;
}

function getFGInfo(value: number) {
  if (value < 25) return { label: '极度恐慌', color: '#059669' };
  if (value < 45) return { label: '市场恐慌', color: '#059669' };
  if (value < 55) return { label: '情绪中性', color: '#94a3b8' };
  if (value < 75) return { label: '市场贪婪', color: '#d97706' };
  return { label: '极度贪婪', color: '#dc2626' };
}

export const SentimentPanel: React.FC<SentimentPanelProps> = ({ sentiment }) => {
  const fgColor = getFearGreedColor(sentiment.fearGreed);
  const fgInfo  = getFGInfo(sentiment.fearGreed);

  const frIsHot  = sentiment.fundingRate > 0.001;
  const frIsCold = sentiment.fundingRate < -0.0005;
  const frColor  = frIsHot ? 'var(--bear)' : frIsCold ? 'var(--bull)' : 'var(--t3)';
  const frLabel  = frIsHot ? '多头过热' : frIsCold ? '空头过热' : '费率均衡';
  const frBg     = frIsHot ? 'var(--bear-bg)' : frIsCold ? 'var(--bull-bg)' : 'var(--bg-subtle)';

  // Gauge arc
  const r = 42, cx = 60, cy = 54;
  const circumference = Math.PI * r;
  const dashOffset = circumference * (1 - sentiment.fearGreed / 100);

  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div className="card-title" style={{ marginBottom: 12 }}>市场情绪</div>

      {/* Gauge */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ width: 120, height: 70, position: 'relative' }}>
          <svg width="120" height="70" viewBox="0 0 120 70">
            <path d="M 18 54 A 42 42 0 0 1 102 54" fill="none" stroke="#e2e8f0" strokeWidth="8" strokeLinecap="round" />
            <path
              d="M 18 54 A 42 42 0 0 1 102 54" fill="none"
              stroke={fgInfo.color} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)' }}
            />
            <text x="60" y="52" textAnchor="middle" fill={fgInfo.color} fontSize="20" fontWeight="700" fontFamily="JetBrains Mono,monospace">
              {sentiment.fearGreed}
            </text>
          </svg>
        </div>
        <div style={{ textAlign: 'center', marginTop: -4 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: fgInfo.color }}>{fgInfo.label}</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>昨日 {sentiment.fearGreedPrev}</div>
        </div>
        {Math.abs(sentiment.fearGreedChange) >= 15 && (
          <div className="badge badge-warn badge-alert" style={{ marginTop: 6, fontSize: 11 }}>
            ⚡ 日变化 {sentiment.fearGreedChange > 0 ? '+' : ''}{sentiment.fearGreedChange}
          </div>
        )}
      </div>

      {/* 资金费率 */}
      <div style={{
        background: 'var(--bg-subtle)', borderRadius: 10,
        padding: '10px 12px', border: '1px solid var(--bd-light)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 2 }}>资金费率</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 16, color: frColor }}>
              {formatFundingRate(sentiment.fundingRate)}
            </div>
          </div>
          <span className="badge" style={{ background: frBg, color: frColor }}>{frLabel}</span>
        </div>
        {/* 方向条 */}
        <div className="level-bar" style={{ marginTop: 4 }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(100, Math.abs(sentiment.fundingRate) / 0.002 * 100)}%`,
              marginLeft: sentiment.fundingRate >= 0 ? '50%' : `${50 - Math.min(50, Math.abs(sentiment.fundingRate) / 0.002 * 50)}%`,
              background: frColor,
            }}
          />
          <div className="absolute top-0 bottom-0 w-px" style={{ left: '50%', background: '#e2e8f0' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--t4)' }}>
          <span style={{ color: 'var(--bull)' }}>空头获益</span>
          <span style={{ color: 'var(--bear)' }}>多头获益</span>
        </div>
      </div>
    </div>
  );
};
