import React, { useEffect } from 'react';
import { useCountdown } from '../hooks/useCountdown';
import { Timer } from 'lucide-react';

interface Props {
  intervalMs: number;
  enabled: boolean;
  onRefresh: () => void;
}

export function RefreshCountdown({ intervalMs, enabled, onRefresh }: Props) {
  const { minutes, seconds, progress, isRunning, start, reset } = useCountdown(intervalMs, onRefresh);

  useEffect(() => {
    if (enabled && !isRunning) {
      start();
    } else if (!enabled) {
      reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  if (!enabled) return null;

  const isUrgent = minutes === 0 && seconds <= 30;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 rounded-xl"
      style={{
        background: isUrgent ? 'rgba(240,185,11,0.08)' : 'rgba(255,255,255,0.04)',
        border: isUrgent ? '1px solid rgba(240,185,11,0.25)' : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <Timer size={13} style={{ color: isUrgent ? '#F0B90B' : '#5C6478' }} />
      <span style={{ color: '#5C6478', fontSize: '11px' }}>下次刷新</span>
      <span
        className="font-mono font-bold text-sm"
        style={{ color: isUrgent ? '#F0B90B' : '#A0A8B8', minWidth: '44px' }}
      >
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
      <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${progress}%`,
            background: isUrgent
              ? 'linear-gradient(90deg, #F0B90B, #FF6B35)'
              : 'linear-gradient(90deg, #00D4AA, #00B896)',
          }}
        />
      </div>
      <span style={{ color: '#5C6478', fontSize: '10px', fontVariantNumeric: 'tabular-nums' }}>
        {progress.toFixed(0)}%
      </span>
    </div>
  );
}
