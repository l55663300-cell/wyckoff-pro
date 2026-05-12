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
      background: '#FFFFFF',
      border: '1px solid #E5E5EA',
      borderRadius: 14,
      padding: 18,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#1C1C1E' }}>🌡️ 市场情绪</span>
        <span style={{ fontSize: 12, color: '#6C6C70', fontWeight: 500 }}>{extremeTag}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: fgColor, flexShrink: 0, display: 'inline-block' }} />
          <span style={{ fontSize: 13, color: '#6C6C70' }}>恐慌贪婪</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: fgColor }}>{sentiment.fearGreed}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#AEAEB2', flexShrink: 0, display: 'inline-block' }} />
          <span style={{ fontSize: 13, color: '#6C6C70' }}>资金费率</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: sentiment.fundingRateAlert ? '#FF9500' : '#3C3C43' }}>
            {(sentiment.fundingRate * 100).toFixed(3)}%
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: heatColor, flexShrink: 0, display: 'inline-block' }} />
          <span style={{ fontSize: 13, color: '#6C6C70' }}>社交热度</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: heatColor }}>
            {socialHeat?.score != null ? socialHeat.score.toFixed(0) : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#AEAEB2', flexShrink: 0, display: 'inline-block' }} />
          <span style={{ fontSize: 13, color: '#6C6C70' }}>非理性分</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: '#3C3C43' }}>{nonRational}</span>
        </div>
      </div>
      <div style={{ borderTop: '1px solid #E5E5EA', marginTop: 12, paddingTop: 10, fontSize: 12, color: '#AEAEB2' }}>
        {heatSentimentStr} · 非理性分{nonRational > 70 ? '偏高' : nonRational < 30 ? '偏低' : '中性'}
        {sentiment.fundingRateAlert ? ' · ⚠️ 资金费率异常' : ''}
      </div>
    </div>
  );
};

export default SentimentCompact;
