import React from 'react';
import { AnalysisResult } from '../../types';

interface Props {
  result: AnalysisResult;
}

const SentimentCompact: React.FC<Props> = ({ result }) => {
  const { sentiment, socialHeat } = result;

  const nonRational = socialHeat
    ? Math.round(sentiment.fearGreed * 0.7 + socialHeat.score * 0.3)
    : sentiment.fearGreed;

  const fgColor =
    sentiment.fearGreed >= 70 ? '#f59e0b' :
    sentiment.fearGreed <= 30 ? '#60a5fa' : '#94a3b8';

  const heatColor =
    socialHeat && socialHeat.score >= 65 ? '#f59e0b' :
    socialHeat && socialHeat.score <= 30 ? '#60a5fa' : '#94a3b8';

  // 情绪综合判断
  const extremeTag =
    sentiment.fearGreed >= 75 ? '⚠️ 极度贪婪' :
    sentiment.fearGreed <= 25 ? '⚠️ 极度恐慌' :
    nonRational > 70         ? '⚠️ 非理性偏高' :
    nonRational < 30         ? '⚠️ 非理性偏低' : '⚪ 无极端信号';

  const heatSentimentStr = !socialHeat
    ? '无社交热度数据'
    : socialHeat.score > 60
    ? `社交热度偏多(${socialHeat.score.toFixed(0)})`
    : `社交热度偏空(${socialHeat.score.toFixed(0)})`;

  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius-card)',
      padding: 16,
      boxShadow: 'var(--shadow-card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>🌡️ 市场情绪</span>
        <span style={{ fontSize: 10, color: 'var(--t3)' }}>{extremeTag}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: fgColor, flexShrink: 0, display: 'inline-block' }} />
          <span style={{ color: 'var(--t3)' }}>恐慌贪婪</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontWeight: 600, color: fgColor }}>{sentiment.fearGreed}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--t3)', flexShrink: 0, display: 'inline-block' }} />
          <span style={{ color: 'var(--t3)' }}>资金费率</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontWeight: 600, color: sentiment.fundingRateAlert ? 'var(--warn)' : 'var(--t2)' }}>
            {(sentiment.fundingRate * 100).toFixed(3)}%
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: heatColor, flexShrink: 0, display: 'inline-block' }} />
          <span style={{ color: 'var(--t3)' }}>社交热度</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontWeight: 600, color: heatColor }}>
            {socialHeat?.score != null ? socialHeat.score.toFixed(0) : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--t3)', flexShrink: 0, display: 'inline-block' }} />
          <span style={{ color: 'var(--t3)' }}>非理性分</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontWeight: 600, color: 'var(--t2)' }}>{nonRational}</span>
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--border-light)', marginTop: 8, paddingTop: 8, fontSize: 10, color: 'var(--t3)' }}>
        {heatSentimentStr} · 非理性分{nonRational > 70 ? '偏高' : nonRational < 30 ? '偏低' : '中性'}
        {sentiment.fundingRateAlert ? ' · ⚠️ 资金费率异常' : ''}
      </div>
    </div>
  );
};

export default SentimentCompact;
