import React from 'react';
import { RefreshCw, BarChart2, TrendingUp, Shield, Bell } from 'lucide-react';
import { Symbol } from '../types';
import { useT } from '../i18n';

interface EmptyStateProps {
  onAnalyze: () => void;
  symbol: Symbol;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onAnalyze, symbol }) => {
  const t = useT();

  const FEATURES = [
    { icon: BarChart2, color: '#00D4AA', title: t.empty.feature1Title, desc: t.empty.feature1Desc },
    { icon: TrendingUp, color: '#4D9FFF', title: t.empty.feature2Title, desc: t.empty.feature2Desc },
    { icon: Shield, color: '#FFB020', title: t.empty.feature3Title, desc: t.empty.feature3Desc },
    { icon: Bell, color: '#00C896', title: t.empty.feature4Title, desc: t.empty.feature4Desc },
  ];

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 animate-fade-in">
      {/* Logo */}
      <div className="text-7xl mb-4" style={{ filter: 'drop-shadow(0 0 30px rgba(0,212,170,0.4))' }}>🦞</div>
      <h1 className="font-bold text-3xl text-white mb-2" style={{ letterSpacing: '-0.03em' }}>{t.empty.brandName}</h1>
      <p style={{ color: '#5C6478', fontSize: '14px', marginBottom: '8px', letterSpacing: '0.06em' }}>{t.empty.tagline}</p>
      <div className="font-mono text-sm px-4 py-1.5 rounded-lg mb-10" style={{ background: 'rgba(0,212,170,0.1)', color: '#00D4AA', border: '1px solid rgba(0,212,170,0.2)' }}>
        {t.empty.currentSymbol(symbol)}
      </div>

      {/* Features grid */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-md mb-10">
        {FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <div key={i} className="glass-card rounded-2xl p-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: `${f.color}15`, border: `1px solid ${f.color}30` }}>
                <Icon size={16} style={{ color: f.color }} />
              </div>
              <div className="font-semibold text-sm text-white mb-1">{f.title}</div>
              <div style={{ color: '#5C6478', fontSize: '11px', lineHeight: '1.5' }}>{f.desc}</div>
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <button
        onClick={onAnalyze}
        className="flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-200 cursor-pointer"
        style={{ background: 'linear-gradient(135deg, #00D4AA, #00B896)', color: '#000', boxShadow: '0 8px 32px rgba(0,212,170,0.4)' }}
      >
        <RefreshCw size={20} />
        {t.empty.analyzeBtn(symbol)}
      </button>
      <p style={{ color: '#5C6478', fontSize: '12px', marginTop: '16px' }}>{t.empty.analyzeHint}</p>
    </div>
  );
};
