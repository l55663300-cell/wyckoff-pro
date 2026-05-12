import React from 'react';
import { AnalysisResult, Timeframe } from '../../types';

interface Props {
  result: AnalysisResult;
}

const TF_LABELS: Record<Timeframe, string> = { '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1D' };

const EvidenceChain: React.FC<Props> = ({ result }) => {
  const { wyckoff, scoring, primaryIndicators: ind, volumeProfile } = result;

  const phaseLabel =
    wyckoff.phase === 'accumulation' ? '吸筹' :
    wyckoff.phase === 'markup'        ? '上涨' :
    wyckoff.phase === 'distribution'  ? '派发' : '下跌';

  const macdStr = ind.macdState === 'golden' ? '金叉' : ind.macdState === 'dead' ? '死叉' : '中性';
  const rsiStr  = ind.rsiState === 'overbought' ? '超买' : ind.rsiState === 'oversold' ? '超卖' : '中性';

  const breakdownStr = scoring.breakdown.length
    ? scoring.breakdown.map(b => `${TF_LABELS[b.timeframe] ?? b.timeframe} ${b.score > 0 ? '+' : ''}${b.score.toFixed(1)}`).join(' · ')
    : '—';

  const lowVolNodes = volumeProfile.filter(v => v.isLowVolume).slice(0, 3);
  const compMan = wyckoff.compositeManBehavior || '—';

  const volVerifStr =
    wyckoff.volumeVerification === 'bullish' ? '量价配合(多)' :
    wyckoff.volumeVerification === 'bearish' ? '量价配合(空)' :
    wyckoff.volumeVerification === 'divergence' ? '量价背离' : '中性';
  const volVerifColor =
    wyckoff.volumeVerification === 'bullish' ? '#34C759' :
    wyckoff.volumeVerification === 'bearish' ? '#FF3B30' : '#AEAEB2';

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px solid #E5E5EA', fontSize: 13 }}>
      <span style={{ color: '#AEAEB2', flexShrink: 0, marginRight: 8 }}>{label}</span>
      <span style={{ color: '#1C1C1E', fontFamily: 'monospace', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word', maxWidth: '65%' }}>{value}</span>
    </div>
  );

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: '#1C1C1E' }}>📊 证据链</span>
      <div style={{ marginTop: 10 }}>
        {row('威科夫阶段', `${phaseLabel} · 置信度 ${(wyckoff.phaseConfidence * 100).toFixed(0)}%`)}
        {row('多周期共振', breakdownStr)}
        {row('RSI(' + ind.rsi.toFixed(0) + ')', <span style={{ color: ind.rsiState === 'overbought' ? '#FF3B30' : ind.rsiState === 'oversold' ? '#34C759' : '#1C1C1E' }}>{rsiStr}</span>)}
        {row('MACD', <span style={{ color: ind.macdState === 'golden' ? '#34C759' : ind.macdState === 'dead' ? '#FF3B30' : '#1C1C1E' }}>{macdStr} · hist {ind.macdHist.toFixed(4)}</span>)}
        {row('ADX 趋势强度', <span style={{ color: ind.adx > 25 ? '#FF9500' : '#AEAEB2' }}>{ind.adx.toFixed(1)} · {ind.adxState === 'strong_bull' ? '强多' : ind.adxState === 'strong_bear' ? '强空' : ind.adxState === 'trending' ? '趋势中' : '震荡'}</span>)}
        {row('复合人行为', compMan)}
        {lowVolNodes.length > 0 && row('低成交量节点', lowVolNodes.map(n => `$${n.priceMid.toFixed(0)}`).join(' / '))}
        {row('量价验证', <span style={{ color: volVerifColor }}>{volVerifStr}</span>)}
      </div>
    </div>
  );
};

export default EvidenceChain;
