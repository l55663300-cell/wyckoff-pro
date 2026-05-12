import React, { useState } from 'react';
import { AnalysisResult, Timeframe } from '../../types';

interface Props {
  result: AnalysisResult;
}

const TF_LABELS: Record<Timeframe, string> = { '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1D' };

const EvidenceChain: React.FC<Props> = ({ result }) => {
  const [open, setOpen] = useState(false);

  const { wyckoff, scoring, primaryIndicators: ind, volumeProfile } = result;

  const phaseLabel =
    wyckoff.phase === 'accumulation' ? '吸筹' :
    wyckoff.phase === 'markup'        ? '上涨' :
    wyckoff.phase === 'distribution'  ? '派发' : '下跌';

  const macdStr = ind.macdState === 'golden' ? '金叉' : ind.macdState === 'dead' ? '死叉' : '中性';
  const rsiStr  = ind.rsiState === 'overbought' ? '超买' : ind.rsiState === 'oversold' ? '超卖' : '中性';

  // 多周期得分字符串
  const breakdownStr = scoring.breakdown.length
    ? scoring.breakdown.map(b => `${TF_LABELS[b.timeframe] ?? b.timeframe} ${b.score > 0 ? '+' : ''}${b.score.toFixed(1)}`).join(' · ')
    : '—';

  // 低成交量节点
  const lowVolNodes = volumeProfile.filter(v => v.isLowVolume).slice(0, 3);

  // compositeMan
  const compMan = wyckoff.compositeManBehavior || '—';

  return (
    <div className="bg-[#0b111e] border border-[#1a2340] rounded-xl p-4">
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm font-semibold text-white">📊 证据链</span>
        <span className="text-xs text-gray-500">{open ? '▼ 收起' : '▶ 点击展开'}</span>
      </div>

      {open && (
        <div className="mt-3 space-y-2 text-[11px]">
          <div className="flex justify-between">
            <span className="text-gray-500">威科夫阶段</span>
            <span className="text-white">{phaseLabel} · 置信度 {(wyckoff.phaseConfidence * 100).toFixed(0)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">多周期共振</span>
            <span className="font-mono text-white text-right max-w-[60%]">{breakdownStr}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">RSI({ind.rsi.toFixed(0)})</span>
            <span className={`font-mono ${ind.rsiState === 'overbought' ? 'text-red-400' : ind.rsiState === 'oversold' ? 'text-green-400' : 'text-white'}`}>{rsiStr}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">MACD</span>
            <span className={`font-mono ${ind.macdState === 'golden' ? 'text-green-400' : ind.macdState === 'dead' ? 'text-red-400' : 'text-white'}`}>{macdStr} · hist {ind.macdHist.toFixed(4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">ADX 趋势强度</span>
            <span className={`font-mono ${ind.adx > 25 ? 'text-yellow-400' : 'text-gray-400'}`}>{ind.adx.toFixed(1)} · {ind.adxState === 'strong_bull' ? '强多' : ind.adxState === 'strong_bear' ? '强空' : ind.adxState === 'trending' ? '趋势中' : '震荡'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">复合人行为</span>
            <span className="text-gray-300 text-right max-w-[60%] leading-snug">{compMan}</span>
          </div>
          {lowVolNodes.length > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">低成交量节点</span>
              <span className="font-mono text-gray-400 text-right">
                {lowVolNodes.map(n => `$${n.priceMid.toFixed(0)}`).join(' / ')}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">量价验证</span>
            <span className={`${wyckoff.volumeVerification === 'bullish' ? 'text-green-400' : wyckoff.volumeVerification === 'bearish' ? 'text-red-400' : 'text-gray-400'}`}>
              {wyckoff.volumeVerification === 'bullish' ? '量价配合(多)' : wyckoff.volumeVerification === 'bearish' ? '量价配合(空)' : wyckoff.volumeVerification === 'divergence' ? '量价背离' : '中性'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EvidenceChain;
