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

  // ── 推导指标 ──
  // 量价方向：用最后3根K线的涨跌幅 + 成交量
  const recentVols = result.volumeProfile.slice(-3);
  const avgVolPoc = volumeProfile.find(v => v.isPOC);
  const volumeTrend = wyckoff.volumeVerification === 'bullish' ? '↑ 多头放量' :
    wyckoff.volumeVerification === 'bearish' ? '↓ 空头放量' :
    wyckoff.volumeVerification === 'divergence' ? '⚠ 量价背离' : '— 缩量震荡';
  const volumeTrendColor = wyckoff.volumeVerification === 'bullish' ? '#34C759' :
    wyckoff.volumeVerification === 'bearish' ? '#FF3B30' :
    wyckoff.volumeVerification === 'divergence' ? '#FF9500' : '#AEAEB2';

  // 日线趋势（用ADX + DI方向近似周线趋势）
  const weeklyTrendStr = ind.adxState === 'strong_bull' ? '↑ 多头主导' :
    ind.adxState === 'strong_bear' ? '↓ 空头主导' :
    ind.adx > 20 ? '~ 趋势形成中' : '— 横盘无趋势';
  const weeklyTrendColor = ind.adxState === 'strong_bull' ? '#34C759' :
    ind.adxState === 'strong_bear' ? '#FF3B30' :
    ind.adx > 20 ? '#FF9500' : '#AEAEB2';

  // ── 新增：ADL 方向 ──
  const adlTrend = scoring.dims.adlTrend ?? 0;
  const adlDirection = adlTrend > 0.5 ? 'long' : adlTrend < -0.5 ? 'short' : 'neutral';
  const finalDirection = scoring.direction;
  const isAdlAgainst = (adlDirection === 'long' && finalDirection === 'short') || (adlDirection === 'short' && finalDirection === 'long');
  const adlStr = adlTrend > 0.5 ? '↑ 累积' : adlTrend < -0.5 ? '↓ 派发' : '— 中性';
  const adlColor = isAdlAgainst ? '#FF9500' : adlDirection === 'long' ? '#34C759' : adlDirection === 'short' ? '#FF3B30' : '#AEAEB2';

  // OI信号：用资金费率推断
  const sentiment = result.sentiment;
  let oiStr = '— 数据不足';
  let oiColor = '#AEAEB2';
  if (sentiment) {
    const fr = sentiment.fundingRate;
    if (fr > 0.002) { oiStr = '多头持仓过热·注意回调'; oiColor = '#FF3B30'; }
    else if (fr > 0.0005) { oiStr = '多头略偏多'; oiColor = '#34C759'; }
    else if (fr < -0.001) { oiStr = '空头持仓过热·反弹机会'; oiColor = '#34C759'; }
    else if (fr < -0.0002) { oiStr = '空头略偏多'; oiColor = '#FF3B30'; }
    else { oiStr = '多空平衡·中性'; oiColor = '#AEAEB2'; }
  }

  // 情绪强度
  let sentimentStr = '中性';
  let sentimentColor = '#AEAEB2';
  if (sentiment) {
    const fg = sentiment.fearGreed;
    if (fg < 15) { sentimentStr = `极度恐慌(${fg}) · 逆向看多`; sentimentColor = '#34C759'; }
    else if (fg < 30) { sentimentStr = `恐慌(${fg}) · 偏多`; sentimentColor = '#34C759'; }
    else if (fg < 65) { sentimentStr = `中性(${fg})`; sentimentColor = '#AEAEB2'; }
    else if (fg < 80) { sentimentStr = `贪婪(${fg}) · 偏空`; sentimentColor = '#FF9500'; }
    else { sentimentStr = `极度贪婪(${fg}) · 警惕`; sentimentColor = '#FF3B30'; }
  }

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px solid #E5E5EA', fontSize: 13 }}>
      <span style={{ color: '#AEAEB2', flexShrink: 0, marginRight: 8 }}>{label}</span>
      <span style={{ color: '#1C1C1E', fontFamily: 'monospace', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word', maxWidth: '65%' }}>{value}</span>
    </div>
  );

  // 用 _ 来避免 unused variable 警告
  void recentVols; void avgVolPoc;

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: '#1C1C1E' }}>📊 证据链</span>
      <div style={{ marginTop: 10 }}>
        {row('威科夫阶段', `${phaseLabel} · 置信度 ${wyckoff.phaseConfidence.toFixed(0)}%`)}
        {row('多周期共振', breakdownStr)}
        {row('RSI(' + ind.rsi.toFixed(0) + ')', <span style={{ color: ind.rsiState === 'overbought' ? '#FF3B30' : ind.rsiState === 'oversold' ? '#34C759' : '#1C1C1E' }}>{rsiStr}</span>)}
        {row('MACD', <span style={{ color: ind.macdState === 'golden' ? '#34C759' : ind.macdState === 'dead' ? '#FF3B30' : '#1C1C1E' }}>{macdStr} · hist {ind.macdHist.toFixed(4)}</span>)}
        {row('ADX 趋势强度', <span style={{ color: ind.adx > 25 ? '#FF9500' : '#AEAEB2' }}>{ind.adx.toFixed(1)} · {ind.adxState === 'strong_bull' ? '强多' : ind.adxState === 'strong_bear' ? '强空' : ind.adxState === 'trending' ? '趋势中' : '震荡'}</span>)}
        {row('复合人行为', compMan)}
        {lowVolNodes.length > 0 && row('低成交量节点', lowVolNodes.map(n => `$${n.priceMid.toFixed(0)}`).join(' / '))}
        {row('量价验证', <span style={{ color: volVerifColor }}>{volVerifStr}</span>)}
        {/* ── 新增行 ── */}
        {row('成交量方向', <span style={{ color: volumeTrendColor }}>{volumeTrend}</span>)}
        {row('ADL方向', <span style={{ color: adlColor }}>{adlStr}</span>)}
        {row('趋势强度', <span style={{ color: weeklyTrendColor }}>{weeklyTrendStr}</span>)}
        {row('资金费率/OI', <span style={{ color: oiColor }}>{oiStr}</span>)}
        {row('市场情绪', <span style={{ color: sentimentColor }}>{sentimentStr}</span>)}
        {scoring.consistency && row('信号一致性',
          <span style={{ color: scoring.consistency.rating === 'high' ? '#34C759' : scoring.consistency.rating === 'low' ? '#FF3B30' : '#FF9500' }}>
            {scoring.consistency.rating === 'high' ? '高' : scoring.consistency.rating === 'medium' ? '中' : '低'} · {scoring.consistency.supportCount}/{scoring.consistency.supportCount + scoring.consistency.againstCount}
          </span>
        )}
      </div>
    </div>
  );
};

export default EvidenceChain;
