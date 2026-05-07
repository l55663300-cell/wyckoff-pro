import React from 'react';
import { LoadingStep } from '../types';
import { Check } from 'lucide-react';
import { useT } from '../i18n';

interface LoadingOverlayProps {
  steps: LoadingStep[];
  symbol: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ steps, symbol }) => {
  const t = useT();
  const done = steps.filter((s) => s.done).length;
  const total = steps.length;
  const pct = Math.round((done / total) * 100);
  const current = steps.find((s) => !s.done);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center" style={{ background: 'rgba(6,9,18,0.92)', backdropFilter: 'blur(16px)' }}>
      <div className="w-full max-w-md mx-4 animate-fade-in">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="text-5xl mb-4" style={{ filter: 'drop-shadow(0 0 20px rgba(0,212,170,0.5))' }}>🦞</div>
          <div className="font-bold text-2xl text-white" style={{ letterSpacing: '-0.02em' }}>{t.loading.brandName}</div>
          <div style={{ color: '#5C6478', fontSize: '13px', marginTop: '4px', letterSpacing: '0.06em' }}>
            {t.loading.analyzing(symbol)}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span style={{ color: '#A0A8B8', fontSize: '13px' }}>
              {current?.label || t.loading.done}
            </span>
            <span className="font-mono font-bold text-base" style={{ color: '#00D4AA' }}>{pct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #00A878, #00D4AA)', boxShadow: '0 0 12px rgba(0,212,170,0.4)' }}
            />
          </div>
          <div style={{ color: '#5C6478', fontSize: '11px', marginTop: '4px' }}>{t.loading.progress(done, total)}</div>
        </div>

        {/* Steps grid */}
        <div className="grid grid-cols-2 gap-2">
          {steps.map((step) => (
            <div
              key={step.id}
              className="flex items-center gap-2 p-2.5 rounded-xl transition-all duration-300"
              style={{
                background: step.done ? 'rgba(0,212,170,0.08)' : 'rgba(255,255,255,0.03)',
                border: step.done ? '1px solid rgba(0,212,170,0.2)' : '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0"
                style={step.done
                  ? { background: 'rgba(0,212,170,0.2)', color: '#00D4AA' }
                  : { background: 'rgba(255,255,255,0.06)', color: '#5C6478' }
                }
              >
                {step.done ? <Check size={11} /> : <span className="font-mono text-xs">{step.id}</span>}
              </div>
              <span className="text-xs leading-tight" style={{ color: step.done ? '#A0A8B8' : '#5C6478' }}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
