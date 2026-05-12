import React from 'react';
import { AnalysisResult } from '../../types';

interface Props {
  result: AnalysisResult;
}

const KeyLevels: React.FC<Props> = ({ result }) => {
  const poc = result.volumeProfile.find(v => v.isPOC);
  const lowVolNodes = result.volumeProfile.filter(v => v.isLowVolume).slice(0, 4);
  const fib = result.fibonacci;
  const aiKey = result.aiReport?.keyStructure;
  const fibKey618 = fib?.retracements?.find(r => r.level === 0.618);
  const fibKey382 = fib?.retracements?.find(r => r.level === 0.382);

  const row = (dot: string, label: string, value: string, valueColor = '#1C1C1E') => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #E5E5EA', fontSize: 13 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6C6C70' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0, display: 'inline-block' }} />
        {label}
      </span>
      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: valueColor }}>{value}</span>
    </div>
  );

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: '#1C1C1E' }}>🏗️ 关键价位</span>
      <div style={{ marginTop: 10, borderTop: '1px solid #E5E5EA', paddingTop: 6 }}>
        {poc && row('#007AFF', 'POC 密集成交', `$${poc.priceMid.toFixed(0)}`, '#007AFF')}
        {fibKey618 && row('#AF52DE', 'Fib 61.8%', `$${fibKey618.price.toFixed(0)}`, '#AF52DE')}
        {fibKey382 && row('#5AC8FA', 'Fib 38.2%', `$${fibKey382.price.toFixed(0)}`, '#5AC8FA')}
        {aiKey?.resistance && row('#FF3B30', '阻力位', aiKey.resistance, '#FF3B30')}
        {aiKey?.support && row('#34C759', '支撑位', aiKey.support, '#34C759')}
        {lowVolNodes.length > 0 && (
          <div style={{ fontSize: 12, color: '#AEAEB2', marginTop: 8, paddingTop: 8, borderTop: '1px solid #E5E5EA' }}>
            低成交量节点（价格真空）：{lowVolNodes.map(n => `$${n.priceMid.toFixed(0)}`).join(' / ')}
          </div>
        )}
        {aiKey?.chipZone && (
          <div style={{ fontSize: 12, color: '#AEAEB2', marginTop: 4 }}>
            筹码集中区：{aiKey.chipZone}
          </div>
        )}
      </div>
    </div>
  );
};

export default KeyLevels;
