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
    <div className="bg-[#0b111e] border border-[#1a2340] rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-white">🌡️ 市场情绪</span>
        <span className="text-[10px] text-gray-500">{extremeTag}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: fgColor }} />
          <span className="text-gray-400">恐慌贪婪</span>
          <span className="ml-auto font-mono" style={{ color: fgColor }}>{sentiment.fearGreed}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
          <span className="text-gray-400">资金费率</span>
          <span className={`ml-auto font-mono ${sentiment.fundingRateAlert ? 'text-yellow-400' : 'text-gray-300'}`}>
            {(sentiment.fundingRate * 100).toFixed(3)}%
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: heatColor }} />
          <span className="text-gray-400">社交热度</span>
          <span className="ml-auto font-mono" style={{ color: heatColor }}>
            {socialHeat?.score != null ? socialHeat.score.toFixed(0) : '—'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
          <span className="text-gray-400">非理性分</span>
          <span className="ml-auto font-mono text-gray-300">{nonRational}</span>
        </div>
      </div>
      <div className="border-t border-gray-800 mt-2 pt-2 text-[10px] text-gray-500">
        {heatSentimentStr} · 非理性分{nonRational > 70 ? '偏高' : nonRational < 30 ? '偏低' : '中性'}
        {sentiment.fundingRateAlert ? ' · ⚠️ 资金费率异常' : ''}
      </div>
    </div>
  );
};

export default SentimentCompact;
