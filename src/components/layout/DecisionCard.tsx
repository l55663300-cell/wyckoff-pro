import React from 'react';
import { AnalysisResult } from '../../types';

interface Props {
  result: AnalysisResult;
}

const DecisionCard: React.FC<Props> = ({ result }) => {
  const direction = result.scoring.direction;
  const isLong = direction === 'long';
  const isShort = direction === 'short';
  const color = isLong ? '#00e676' : isShort ? '#ff5252' : '#94a3b8';

  const phaseLabel =
    result.wyckoff.phase === 'accumulation' ? '吸筹阶段' :
    result.wyckoff.phase === 'markup'        ? '上涨阶段' :
    result.wyckoff.phase === 'distribution'  ? '派发阶段' : '下跌阶段';

  const dirLabel = isLong ? '做多建议' : isShort ? '做空建议' : '中性观望';
  const dirTag   = isLong ? '做多' : isShort ? '做空' : '观望';

  const risk = result.risk;

  const copyReport = () => {
    const ai = result.aiReport;
    const text = ai
      ? `【威科夫PRO策略报告】\n${ai.direction} | 评分 ${ai.score}\n入场：${ai.entryLow}–${ai.entryHigh}\n止损：${ai.stopLoss}\n目标1：${ai.target1}  目标2：${ai.target2}\n仓位：${ai.positionAdvice}\n\n${ai.summary}`
      : result.report;
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div className="bg-[#0b111e] border border-[#1a2340] rounded-xl p-4">
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-white">🦞 威科夫PRO策略报告</span>
        <div className="flex gap-2">
          <span
            className="text-[10px] px-2 py-0.5 rounded-full border font-semibold"
            style={{
              color,
              borderColor: `${color}50`,
              background: `${color}15`,
            }}
          >
            {dirTag}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700 font-mono">
            评分 {result.scoring.score.toFixed(1)}
          </span>
        </div>
      </div>

      {/* 方向 + 概率条 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl font-bold" style={{ color }}>{dirLabel}</span>
        <span className="text-xs text-gray-400">信心概率 {result.scoring.probability}%</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full mb-3">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${result.scoring.probability}%`, backgroundColor: color }}
        />
      </div>

      {/* 关键参数网格 */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-3">
        <div className="flex flex-col">
          <span className="text-gray-500 text-[10px]">入场区间</span>
          <span className="font-mono text-white">${risk.entryLow.toFixed(0)} – ${risk.entryHigh.toFixed(0)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-500 text-[10px]">动态止损 (ATR×2)</span>
          <span className="font-mono text-red-400">${risk.stopLoss.toFixed(0)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-500 text-[10px]">保守止盈 (50%)</span>
          <span className="font-mono text-green-400">${risk.target1.toFixed(0)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-500 text-[10px]">理想止盈 (30%)</span>
          <span className="font-mono text-green-400">${risk.target2.toFixed(0)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-500 text-[10px]">激进止盈 (20%)</span>
          <span className="font-mono text-green-400">移动止损</span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-500 text-[10px]">仓位 / 杠杆 / 盈亏比</span>
          <span className="font-mono text-white">
            {risk.positionSize}% · {risk.leverage}x · {risk.riskReward.toFixed(2)}
          </span>
        </div>
        <div className="col-span-2 flex flex-col mt-1">
          <span className="text-gray-500 text-[10px]">时间止损</span>
          <span className="font-mono text-white">
            {risk.timeStopHours}小时内未脱离成本区±0.5% → 建议平仓
          </span>
        </div>
      </div>

      {/* 阶段摘要 */}
      <div className="text-[11px] text-gray-300 mb-3 border-t border-gray-800 pt-3">
        📋 {phaseLabel} · 评分维度：威科夫{result.scoring.dims.wyckoff.toFixed(0)} / 量能{result.scoring.dims.volume.toFixed(0)} / 动量{result.scoring.dims.momentum.toFixed(0)} / 情绪{result.scoring.dims.sentiment.toFixed(0)}
      </div>

      <button
        onClick={copyReport}
        className="w-full py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-white font-medium transition"
      >
        📄 复制策略到剪贴板
      </button>
    </div>
  );
};

export default DecisionCard;
