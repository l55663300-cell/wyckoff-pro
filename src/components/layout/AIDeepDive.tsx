import React, { useState } from 'react';
import { AnalysisResult } from '../../types';

interface Props {
  result: AnalysisResult;
}

const AIDeepDive: React.FC<Props> = ({ result }) => {
  const [showRaw, setShowRaw] = useState(false);

  const ai = result.aiReport;

  const insight = ai?.summary
    ? ai.summary
    : (() => {
        const phaseStr =
          result.wyckoff.phase === 'accumulation' ? '吸筹阶段，主力建仓中' :
          result.wyckoff.phase === 'markup'        ? '上涨阶段，趋势向上' :
          result.wyckoff.phase === 'distribution'  ? '派发阶段，主力出货' : '下跌阶段，空头主导';
        const dirStr =
          result.scoring.direction === 'long'  ? '综合信号看多，建议做多布局' :
          result.scoring.direction === 'short' ? '综合信号看空，建议做空布局' : '信号中性，建议观望';
        const macd = result.primaryIndicators;
        const macdStr = macd.macdState === 'golden' ? 'MACD金叉' : macd.macdState === 'dead' ? 'MACD死叉' : 'MACD中性';
        const rsiStr = macd.rsiState === 'overbought' ? 'RSI超买' : macd.rsiState === 'oversold' ? 'RSI超卖' : `RSI${macd.rsi.toFixed(0)}中性`;
        const poc = result.volumeProfile.find(v => v.isPOC);
        const pocStr = poc ? `POC密集成交区 $${poc.priceMid.toFixed(0)} 构成关键支撑/阻力。` : '';
        return `当前市场处于${phaseStr}，${dirStr}。技术面：${macdStr}，${rsiStr}，威科夫阶段置信度${(result.wyckoff.phaseConfidence * 100).toFixed(0)}%。${pocStr}综合评分 ${result.scoring.score.toFixed(1)}，信心概率 ${result.scoring.probability}%，请严格遵守止损纪律。`;
      })();

  const rawText = ai
    ? JSON.stringify(ai, null, 2)
    : `phase=${result.wyckoff.phase}, confidence=${(result.wyckoff.phaseConfidence * 100).toFixed(0)}%, score=${result.scoring.score.toFixed(2)}, probability=${result.scoring.probability}%, direction=${result.scoring.direction}, RSI=${result.primaryIndicators.rsi.toFixed(1)}, MACD=${result.primaryIndicators.macd.toFixed(4)}, ATR=${result.primaryIndicators.atr.toFixed(2)}`;

  const source = ai ? 'AI大模型' : '本地引擎';

  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #E5E5EA',
      borderRadius: 14,
      padding: 18,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#1C1C1E' }}>🤖 策略深度解读</span>
        <span style={{
          fontSize: 11, padding: '3px 10px', borderRadius: 20,
          background: 'rgba(0,122,255,0.08)', color: '#007AFF', fontWeight: 600,
        }}>{source}</span>
      </div>
      <p style={{ fontSize: 14, color: '#3C3C43', lineHeight: 1.8, margin: 0 }}>{insight}</p>
      {ai?.wyckoffAnalysis && (
        <p style={{
          fontSize: 13, color: '#6C6C70', lineHeight: 1.7, marginTop: 10,
          borderTop: '1px solid #E5E5EA', paddingTop: 10,
        }}>
          {ai.wyckoffAnalysis}
        </p>
      )}
      <button
        onClick={() => setShowRaw(!showRaw)}
        style={{
          fontSize: 12, color: '#007AFF', background: 'none', border: 'none',
          cursor: 'pointer', padding: '6px 0', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        {showRaw ? '▼ 收起原始数据' : '▶ 展开原始数据'}
      </button>
      {showRaw && (
        <pre style={{
          marginTop: 8, padding: 12, background: '#F2F2F7', borderRadius: 8,
          fontFamily: 'monospace', fontSize: 11, color: '#6C6C70', lineHeight: 1.5,
          border: '1px solid #E5E5EA', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {rawText}
        </pre>
      )}
    </div>
  );
};

export default AIDeepDive;
