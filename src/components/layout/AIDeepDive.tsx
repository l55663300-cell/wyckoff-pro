import React, { useState } from 'react';
import { AnalysisResult } from '../../types';

interface Props {
  result: AnalysisResult;
}

const AIDeepDive: React.FC<Props> = ({ result }) => {
  const [showRaw, setShowRaw] = useState(false);

  const ai = result.aiReport;
  const consistency = result.scoring.consistency;

  const insight = ai?.summary
    ? ai.summary
    : (() => {
        const phaseStr =
          result.wyckoff.phase === 'accumulation' ? '吸筹阶段，主力建仓中' :
          result.wyckoff.phase === 'markup'        ? '上涨阶段，趋势向上' :
          result.wyckoff.phase === 'distribution'  ? '派发阶段，主力出货' : '下跌阶段，空头主导';
        const dirStr =
          result.scoring.direction === 'long'  ? '综合信号偏多' :
          result.scoring.direction === 'short' ? '综合信号偏空' : '信号中性';
        const macd = result.primaryIndicators;
        const macdStr = macd.macdState === 'golden' ? 'MACD金叉' : macd.macdState === 'dead' ? 'MACD死叉' : 'MACD中性';
        const rsiStr = macd.rsiState === 'overbought' ? 'RSI超买' : macd.rsiState === 'oversold' ? 'RSI超卖' : `RSI${macd.rsi.toFixed(0)}中性`;
        const poc = result.volumeProfile.find(v => v.isPOC);
        const pocStr = poc ? `POC密集成交区 $${poc.priceMid.toFixed(0)} 构成关键支撑/阻力。` : '';

        // 按概率三档给出不同力度的操作建议
        const prob = result.scoring.probability;
        let advice = '';
        if (prob >= 70) {
          advice = result.scoring.direction === 'neutral'
            ? '多指标共振明显，但方向尚不明朗，建议等待突破方向确认后跟进。'
            : '技术证据充分，信号共振强，可按计划操作，严守止损。';
        } else if (prob >= 50) {
          advice = '结构基本成立但置信度中等，建议轻仓或等待放量突破再确认后入场。';
        } else {
          advice = '当前多空信号冲突，方向不明确，建议观望，不宜追单。';
        }

        return `当前市场处于${phaseStr}，${dirStr}。技术面：${macdStr}，${rsiStr}，威科夫置信度 ${result.wyckoff.phaseConfidence.toFixed(0)}%。${pocStr}综合评分 ${result.scoring.score.toFixed(1)}，信心概率 ${prob}%。${advice}`;
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

      {/* ── 信号一致性 ── */}
      {consistency && (
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8,
          background: consistency.rating === 'high' ? 'rgba(52,199,89,0.08)' :
            consistency.rating === 'low' ? 'rgba(255,59,48,0.08)' : 'rgba(255,149,0,0.08)',
          border: `1px solid ${
            consistency.rating === 'high' ? 'rgba(52,199,89,0.25)' :
            consistency.rating === 'low' ? 'rgba(255,59,48,0.25)' : 'rgba(255,149,0,0.25)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
            color: consistency.rating === 'high' ? '#34C759' : consistency.rating === 'low' ? '#FF3B30' : '#FF9500' }}>
            <span>{consistency.rating === 'high' ? '✅' : consistency.rating === 'low' ? '⚠️' : '⚡'}</span>
            <span>信号一致性：{consistency.rating === 'high' ? '高' : consistency.rating === 'medium' ? '中' : '低'}</span>
          </div>
          <div style={{ fontSize: 11, color: '#6C6C70', marginTop: 4 }}>
            支持维度 {consistency.supportCount}/{consistency.supportCount + consistency.againstCount}
          </div>
          {consistency.againstDetails.length > 0 && (
            <div style={{ fontSize: 11, color: '#FF3B30', marginTop: 3 }}>
              ⚠️ {consistency.againstDetails.join('、')}
            </div>
          )}
        </div>
      )}

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
