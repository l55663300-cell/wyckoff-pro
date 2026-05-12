import React from 'react';
import { AnalysisResult } from '../../types';

interface Props {
  result: AnalysisResult;
}

const KeyLevels: React.FC<Props> = ({ result }) => {
  const poc = result.volumeProfile.find(v => v.isPOC);
  const lowVolNodes = result.volumeProfile.filter(v => v.isLowVolume).slice(0, 4);
  const fib = result.fibonacci;

  // 从 aiReport 或 scoring signals 里取阻力/支撑
  const aiKey = result.aiReport?.keyStructure;

  // 斐波那契关键位
  const fibKey618 = fib?.retracements?.find(r => r.level === 0.618);
  const fibKey382 = fib?.retracements?.find(r => r.level === 0.382);

  return (
    <div className="bg-[#0b111e] border border-[#1a2340] rounded-xl p-4">
      <span className="text-sm font-semibold text-white">🏗️ 关键价位</span>
      <div className="mt-2 space-y-1.5 text-xs">
        {poc && (
          <div className="flex justify-between">
            <span className="text-gray-500">POC 密集成交</span>
            <span className="font-mono text-white">${poc.priceMid.toFixed(0)}</span>
          </div>
        )}
        {fibKey618 && (
          <div className="flex justify-between">
            <span className="text-gray-500 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
              Fib 61.8%
            </span>
            <span className="font-mono text-purple-400">${fibKey618.price.toFixed(0)}</span>
          </div>
        )}
        {fibKey382 && (
          <div className="flex justify-between">
            <span className="text-gray-500 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              Fib 38.2%
            </span>
            <span className="font-mono text-blue-400">${fibKey382.price.toFixed(0)}</span>
          </div>
        )}
        {aiKey?.resistance && (
          <div className="flex justify-between">
            <span className="text-gray-500 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              阻力位
            </span>
            <span className="font-mono text-red-400">{aiKey.resistance}</span>
          </div>
        )}
        {aiKey?.support && (
          <div className="flex justify-between">
            <span className="text-gray-500 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              支撑位
            </span>
            <span className="font-mono text-green-400">{aiKey.support}</span>
          </div>
        )}
        {lowVolNodes.length > 0 && (
          <div className="text-[10px] text-gray-600 mt-1 border-t border-gray-800 pt-1">
            低成交量节点（价格真空）：{lowVolNodes.map(n => `$${n.priceMid.toFixed(0)}`).join(' / ')}
          </div>
        )}
        {aiKey?.chipZone && (
          <div className="text-[10px] text-gray-500 mt-1">
            筹码集中区：{aiKey.chipZone}
          </div>
        )}
      </div>
    </div>
  );
};

export default KeyLevels;
