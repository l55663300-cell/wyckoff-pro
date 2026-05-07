import React from 'react';
import { WyckoffAnalysis } from '../../types';
import { TrendingUp, TrendingDown, BarChart2, AlertTriangle, Zap } from 'lucide-react';
import { useT } from '../../i18n';

interface PhaseCardProps {
  wyckoff: WyckoffAnalysis;
}

export const PhaseCard: React.FC<PhaseCardProps> = ({ wyckoff }) => {
  const t = useT();

  const PHASE_CONFIG = {
    accumulation: {
      label: t.phase.accumulationLabel,
      labelEn: 'Accumulation',
      color: '#00D4AA',
      bg: 'rgba(0,212,170,0.08)',
      border: 'rgba(0,212,170,0.2)',
      icon: BarChart2,
      desc: t.phase.accumulationDesc,
      emoji: '⚡',
    },
    markup: {
      label: t.phase.markupLabel,
      labelEn: 'Markup',
      color: '#00C896',
      bg: 'rgba(0,200,150,0.08)',
      border: 'rgba(0,200,150,0.2)',
      icon: TrendingUp,
      desc: t.phase.markupDesc,
      emoji: '🚀',
    },
    distribution: {
      label: t.phase.distributionLabel,
      labelEn: 'Distribution',
      color: '#FFB020',
      bg: 'rgba(255,176,32,0.08)',
      border: 'rgba(255,176,32,0.2)',
      icon: AlertTriangle,
      desc: t.phase.distributionDesc,
      emoji: '⚠️',
    },
    markdown: {
      label: t.phase.markdownLabel,
      labelEn: 'Markdown',
      color: '#FF4D6A',
      bg: 'rgba(255,77,106,0.08)',
      border: 'rgba(255,77,106,0.2)',
      icon: TrendingDown,
      desc: t.phase.markdownDesc,
      emoji: '🔻',
    },
  };

  const PATTERN_CONFIG = {
    spring:    { label: t.phase.springLabel,    color: '#02C076', badge: 'badge-bull', tip: t.phase.springTip },
    upthrust:  { label: t.phase.upthrustLabel,  color: '#F6465D', badge: 'badge-bear', tip: t.phase.upthrustTip },
    sos:       { label: t.phase.sosLabel,        color: '#02C076', badge: 'badge-bull', tip: t.phase.sosTip },
    sow:       { label: t.phase.sowLabel,        color: '#F6465D', badge: 'badge-bear', tip: t.phase.sowTip },
    none:      { label: t.phase.noneLabel,       color: '#848E9C', badge: 'badge-neutral', tip: t.phase.noneTip },
  };

  const VOL_CONFIG = {
    bullish:    { label: t.phase.volBullish,    sublabel: t.phase.volBullishSub,    color: '#00C896', icon: '✅' },
    bearish:    { label: t.phase.volBearish,    sublabel: t.phase.volBearishSub,    color: '#FF4D6A', icon: '⚠️' },
    divergence: { label: t.phase.volDivergence, sublabel: t.phase.volDivergenceSub, color: '#FFB020', icon: '⚠️' },
    neutral:    { label: t.phase.volNeutral,    sublabel: t.phase.volNeutralSub,    color: '#5C6478', icon: '—' },
  };

  const phaseConf = PHASE_CONFIG[wyckoff.phase];
  const patternConf = PATTERN_CONFIG[wyckoff.pattern];
  const volConf = VOL_CONFIG[wyckoff.volumeVerification];
  const Icon = phaseConf.icon;

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      {/* Phase header banner */}
      <div className="px-4 py-3 flex items-center gap-3" style={{ background: phaseConf.bg, borderBottom: `1px solid ${phaseConf.border}` }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${phaseConf.color}20`, border: `1px solid ${phaseConf.color}40` }}>
          <Icon size={16} style={{ color: phaseConf.color }} />
        </div>
        <div className="flex-1">
          <div className="text-white font-bold text-base leading-none">{phaseConf.label}</div>
          <div style={{ color: phaseConf.color, fontSize: '10px', letterSpacing: '0.06em', marginTop: '2px' }}>{phaseConf.labelEn}</div>
        </div>
        <div className="text-right">
          <div className="font-mono font-bold text-xl" style={{ color: phaseConf.color }}>{wyckoff.phaseConfidence}%</div>
          <div style={{ color: '#5C6478', fontSize: '10px' }}>{t.phase.confidence}</div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Confidence bar */}
        <div>
          <div className="level-bar">
            <div className="h-full rounded-full progress-bar" style={{ width: `${wyckoff.phaseConfidence}%`, background: `linear-gradient(90deg, ${phaseConf.color}80, ${phaseConf.color})` }} />
          </div>
          <p style={{ color: '#A0A8B8', fontSize: '11px', marginTop: '4px' }}>{phaseConf.desc}</p>
        </div>

        {/* Pattern */}
        <div className="flex items-start justify-between gap-2 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div>
            <div style={{ color: '#5C6478', fontSize: '11px', marginBottom: '4px' }}>{t.phase.patternLabel}</div>
            <span className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${patternConf.badge}`}>
              {patternConf.label}
            </span>
          </div>
          <div className="text-right">
            <div style={{ color: '#5C6478', fontSize: '10px', marginBottom: '4px' }}>{t.phase.signalDesc}</div>
            <div style={{ color: '#A0A8B8', fontSize: '10px', maxWidth: '100px', textAlign: 'right', lineHeight: '1.4' }}>{patternConf.tip}</div>
          </div>
        </div>

        {/* Volume verification */}
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="text-xl">{volConf.icon}</div>
          <div className="flex-1">
            <div className="font-semibold text-sm" style={{ color: volConf.color }}>{volConf.label}</div>
            <div style={{ color: '#5C6478', fontSize: '11px' }}>{volConf.sublabel}</div>
          </div>
        </div>

        {/* Composite man */}
        <div className="p-3 rounded-xl" style={{ background: 'rgba(0,212,170,0.04)', border: '1px solid rgba(0,212,170,0.12)' }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Zap size={11} style={{ color: '#00D4AA' }} />
            <span style={{ color: '#00D4AA', fontSize: '11px', fontWeight: '600', letterSpacing: '0.04em' }}>{t.phase.compositeMan}</span>
          </div>
          <p style={{ color: '#A0A8B8', fontSize: '12px', lineHeight: '1.6' }}>{wyckoff.compositeManBehavior}</p>
        </div>
      </div>
    </div>
  );
};
