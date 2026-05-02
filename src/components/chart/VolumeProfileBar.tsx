import React from 'react';
import { VolumeProfileNode } from '../../types';
import { formatPrice } from '../../utils/formatters';

interface VolumeProfileBarProps {
  profile: VolumeProfileNode[];
  symbol: string;
  currentPrice: number;
  height?: number;
}

export const VolumeProfileBar: React.FC<VolumeProfileBarProps> = ({ profile, symbol, currentPrice, height = 380 }) => {
  if (profile.length === 0) return (
    <div className="flex items-center justify-center h-full text-text-muted text-xs">
      暂无数据
    </div>
  );

  // Show 30 bins for display
  const displayNodes = [...profile].reverse();
  const pocNode = displayNodes.find((n) => n.isPOC);

  return (
    <div className="flex flex-col h-full" style={{ height }}>
      <div style={{ fontSize: 9, marginBottom: 2, padding: '0 4px', color: '#94a3b8', fontFamily: 'monospace', overflow: 'hidden', whiteSpace: 'nowrap' }}>VP</div>
      {pocNode && (
        <div style={{ fontSize: 9, fontFamily: 'monospace', padding: '0 4px', marginBottom: 2, color: '#d97706', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          POC: ${formatPrice(pocNode.priceMid, symbol)}
        </div>
      )}
      <div className="flex-1 flex flex-col justify-between gap-px overflow-hidden">
        {displayNodes.map((node, i) => {
          const isNearPrice = Math.abs(node.priceMid - currentPrice) / currentPrice < 0.005;
          let barColor = 'rgba(37,99,235,0.18)';
          if (node.isPOC) barColor = '#f59e0b';
          else if (node.percentage > 60) barColor = 'rgba(37,99,235,0.45)';
          else if (node.isLowVolume) barColor = 'rgba(37,99,235,0.06)';

          return (
            <div key={i} className="flex items-center gap-1 group relative" style={{ height: `${100 / displayNodes.length}%` }}>
              <div
                className="h-full rounded-sm transition-all duration-300"
                style={{
                  width: `${Math.max(4, node.percentage)}%`,
                  background: barColor,
                  border: isNearPrice ? '1px solid #2563eb' : 'none',
                }}
              />
              {node.isPOC && (
                <div className="absolute left-0 right-0 border-t border-dashed pointer-events-none" style={{ borderColor: '#f59e0b80' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
