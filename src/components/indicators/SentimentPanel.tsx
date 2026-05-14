import React from 'react';
import { SentimentData, SocialHeatData } from '../../types';
import { formatFundingRate, getFearGreedColor } from '../../utils/formatters';
import { useT } from '../../i18n';

interface SentimentPanelProps {
  sentiment: SentimentData;
  socialHeat?: SocialHeatData | null;
}

export const SentimentPanel: React.FC<SentimentPanelProps> = ({ sentiment, socialHeat }) => {
  const t = useT();

  function getFGInfo(value: number) {
    if (value < 25) return { label: t.sentiment.extremeFear, color: '#059669' };
    if (value < 45) return { label: t.sentiment.fear,        color: '#059669' };
    if (value < 55) return { label: t.sentiment.neutral,     color: '#94a3b8' };
    if (value < 75) return { label: t.sentiment.greed,       color: '#d97706' };
    return           { label: t.sentiment.extremeGreed,       color: '#dc2626' };
  }

  const fgColor = getFearGreedColor(sentiment.fearGreed);
  const fgInfo  = getFGInfo(sentiment.fearGreed);

  const frIsHot  = sentiment.fundingRate > 0.001;
  const frIsCold = sentiment.fundingRate < -0.0005;
  const frColor  = frIsHot ? 'var(--bear)' : frIsCold ? 'var(--bull)' : 'var(--t3)';
  const frLabel  = frIsHot ? t.sentiment.longOverheat : frIsCold ? t.sentiment.shortOverheat : t.sentiment.rateBalance;
  const frBg     = frIsHot ? 'var(--bear-bg)' : frIsCold ? 'var(--bull-bg)' : 'var(--bg-subtle)';

  // Gauge arc
  const r = 42, cx = 60, cy = 54;
  const circumference = Math.PI * r;
  const dashOffset = circumference * (1 - sentiment.fearGreed / 100);

  // 非理性分：恐贪 × 0.7 + 社交情绪 × 0.3
  const nonRational = socialHeat
    ? Math.round((sentiment.fearGreed * 0.7 + ((socialHeat.sentiment + 1) * 50) * 0.3))
    : sentiment.fearGreed;
  const nonRationalColor = nonRational > 70 ? '#dc2626' : nonRational < 30 ? '#059669' : '#d97706';
  const nonRationalLabel = nonRational > 70 ? '⚠️ 市场狂热，警惕派发' : nonRational < 30 ? '💧 极度恐惧，关注 Spring' : '⚖️ 情绪中性';

  const heatColor = socialHeat
    ? (socialHeat.score > 70 ? '#dc2626' : socialHeat.score > 45 ? '#d97706' : '#2563eb')
    : '#2563eb';

  const sentimentLabel = socialHeat
    ? (socialHeat.sentiment > 0.2 ? '偏多' : socialHeat.sentiment < -0.2 ? '偏空' : '中性')
    : '-';
  const sentimentColor = socialHeat
    ? (socialHeat.sentiment > 0.2 ? '#059669' : socialHeat.sentiment < -0.2 ? '#dc2626' : '#94a3b8')
    : '#94a3b8';

  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div className="card-title" style={{ marginBottom: 12 }}>{t.sentiment.title}</div>

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
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{t.sentiment.yesterday(sentiment.fearGreedPrev)}</div>
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
        marginBottom: socialHeat ? 10 : 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 2 }}>{t.sentiment.fundingRate}</div>
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
          <span style={{ color: 'var(--bull)' }}>{t.sentiment.shortProfit}</span>
          <span style={{ color: 'var(--bear)' }}>{t.sentiment.longProfit}</span>
        </div>
      </div>

      {/* Taker 主动买卖量比 */}
      <div style={{
        background: 'var(--bg-subtle)', borderRadius: 10,
        padding: '10px 12px', border: '1px solid var(--bd-light)',
        marginBottom: socialHeat ? 10 : 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--t3)' }}>主动买卖量比 (Taker)</div>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 14,
            color: sentiment.takerBuyRatio > 0.55 ? 'var(--bull)' : sentiment.takerBuyRatio < 0.45 ? 'var(--bear)' : 'var(--t3)',
          }}>
            {sentiment.takerBuyRatio.toFixed(3)}
          </span>
        </div>
        {/* 方向条 */}
        <div className="level-bar" style={{ marginTop: 2 }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.abs(sentiment.takerBuyRatio - 0.5) * 2 * 100}%`,
              marginLeft: sentiment.takerBuyRatio >= 0.5 ? '50%' : `${50 - Math.abs(sentiment.takerBuyRatio - 0.5) * 2 * 50}%`,
              background: sentiment.takerBuyRatio > 0.55 ? 'var(--bull)' : sentiment.takerBuyRatio < 0.45 ? 'var(--bear)' : 'var(--t3)',
            }}
          />
          <div className="absolute top-0 bottom-0 w-px" style={{ left: '50%', background: '#e2e8f0' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--t4)' }}>
          <span style={{ color: 'var(--bear)' }}>主动卖出多</span>
          <span style={{ color: 'var(--t3)' }}>中性 0.5</span>
          <span style={{ color: 'var(--bull)' }}>主动买入多</span>
        </div>
      </div>

      {/* 社交热度 */}
      {socialHeat && (
        <>
          {/* 社交热度分 */}
          <div style={{
            background: 'var(--bg-subtle)', borderRadius: 10,
            padding: '10px 12px', border: '1px solid var(--bd-light)',
            marginBottom: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)' }}>📡 社交热度</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: sentimentColor, fontWeight: 600 }}>{sentimentLabel}</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 16, color: heatColor }}>
                  {socialHeat.score.toFixed(0)}
                </span>
              </div>
            </div>
            {/* 热度条 */}
            <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: `${socialHeat.score}%`, background: heatColor,
                transition: 'width 0.7s',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t4)' }}>
              <span>24h 提及 {socialHeat.mentionCount} 次</span>
              <span style={{ color: sentimentColor }}>{sentimentLabel}</span>
            </div>
          </div>

          {/* 市场非理性分 */}
          <div style={{
            background: `${nonRationalColor}08`, borderRadius: 10,
            padding: '10px 12px', border: `1px solid ${nonRationalColor}30`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)' }}>🧠 市场非理性分</div>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 16, color: nonRationalColor }}>
                {nonRational}
              </span>
            </div>
            <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: `${nonRational}%`, background: nonRationalColor,
                transition: 'width 0.7s',
              }} />
            </div>
            <div style={{ fontSize: 11, color: nonRationalColor, fontWeight: 600 }}>{nonRationalLabel}</div>
          </div>
        </>
      )}
    </div>
  );
};
