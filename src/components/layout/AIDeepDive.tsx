import React, { useState } from 'react';
import { AnalysisResult } from '../../types';

interface Props {
  result: AnalysisResult;
}

const AIDeepDive: React.FC<Props> = ({ result }) => {
  const [showRaw, setShowRaw] = useState(false);

  const ai = result.aiReport;

  // 优先用 AI 大模型摘要，无则本地拼接
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

  // 原始数据摘要
  const rawText = ai
    ? JSON.stringify(ai, null, 2)
    : `phase=${result.wyckoff.phase}, confidence=${(result.wyckoff.phaseConfidence * 100).toFixed(0)}%, score=${result.scoring.score.toFixed(2)}, probability=${result.scoring.probability}%, direction=${result.scoring.direction}, RSI=${result.primaryIndicators.rsi.toFixed(1)}, MACD=${result.primaryIndicators.macd.toFixed(4)}, ATR=${result.primaryIndicators.atr.toFixed(2)}`;

  const source = ai ? 'AI大模型' : '本地引擎';

  return (
    <div className="bg-[#0b111e] border border-[#1a2340] rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-white">🤖 AI深度解读</span>
        <span className="text-[10px] text-gray-500">{source}</span>
      </div>
      <p className="text-xs text-gray-300 leading-relaxed">{insight}</p>
      {ai && ai.wyckoffAnalysis && (
        <p className="text-[11px] text-gray-400 leading-relaxed mt-2 border-t border-gray-800 pt-2">
          {ai.wyckoffAnalysis}
        </p>
      )}
      <button
        onClick={() => setShowRaw(!showRaw)}
        className="text-[10px] text-cyan-400 hover:text-cyan-300 mt-2 inline-flex items-center gap-1"
      >
        {showRaw ? '▼ 收起原始数据' : '▶ 展开原始数据'}
      </button>
      {showRaw && (
        <pre className="mt-2 p-3 bg-[#0a0f1c] rounded-lg font-mono text-[10px] text-gray-500 leading-relaxed border border-[#1a2340] overflow-x-auto whitespace-pre-wrap break-all">
          {rawText}
        </pre>
      )}
    </div>
  );
};

export default AIDeepDive;
