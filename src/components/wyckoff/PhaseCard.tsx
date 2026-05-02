import React from 'react';
import { WyckoffAnalysis } from '../../types';
import { TrendingUp, TrendingDown, BarChart2, AlertTriangle, Zap } from 'lucide-react';

interface PhaseCardProps {
  wyckoff: WyckoffAnalysis;
}

const PHASE_CONFIG = {
  accumulation: {
    label: '吸筹区',
    labelEn: 'Accumulation',
    color: '#00D4AA',
    bg: 'rgba(0,212,170,0.08)',
    border: 'rgba(0,212,170,0.2)',
    icon: BarChart2,
    desc: '底部横盘，缩量震荡，复合人静默吸筹',
    emoji: '⚡',
  },
  markup: {
    label: '上涨趋势',
    labelEn: 'Markup',
    color: '#00C896',
    bg: 'rgba(0,200,150,0.08)',
    border: 'rgba(0,200,150,0.2)',
    icon: TrendingUp,
    desc: '突破吸筹区，放量上涨，趋势确立',
    emoji: '🚀',
  },
  distribution: {
    label: '派发区',
    labelEn: 'Distribution',
    color: '#FFB020',
    bg: 'rgba(255,176,32,0.08)',
    border: 'rgba(255,176,32,0.2)',
    icon: AlertTriangle,
    desc: '顶部横盘，放量滞涨，复合人派发筹码',
    emoji: '⚠️',
  },
  markdown: {
    label: '下跌趋势',
    labelEn: 'Markdown',
    color: '#FF4D6A',
    bg: 'rgba(255,77,106,0.08)',
    border: 'rgba(255,77,106,0.2)',
    icon: TrendingDown,
    desc: '跌破派发区，加速下跌，空头主导',
    emoji: '🔻',
  },
};

const PATTERN_CONFIG = {
  spring: { label: '弹簧效应 (Spring)', color: '#02C076', badge: 'badge-bull', tip: '假跌破后快速拉回→吸筹末期' },
  upthrust: { label: '假突破 (UpThrust)', color: '#F6465D', badge: 'badge-bear', tip: '假突破后快速回落→派发信号' },
  sos: { label: '力量迹象 (SOS)', color: '#02C076', badge: 'badge-bull', tip: '突破关键压力位+放量→上涨确认' },
  sow: { label: '弱势迹象 (SOW)', color: '#F6465D', badge: 'badge-bear', tip: '跌破关键支撑位+放量→下跌确认' },
  none: { label: '无明显形态 · 等待方向', color: '#848E9C', badge: 'badge-neutral', tip: '暂无经典形态，等待信号' },
};

const VOL_CONFIG = {
  bullish: { label: '放量上涨', sublabel: '量价健康', color: '#00C896', icon: '✅' },
  bearish: { label: '放量下跌', sublabel: '看空信号', color: '#FF4D6A', icon: '⚠️' },
  divergence: { label: '量价背离', sublabel: '警惕反转', color: '#FFB020', icon: '⚠️' },
  neutral: { label: '量价中性', sublabel: '无明显信号', color: '#5C6478', icon: '—' },
};

export const PhaseCard: React.FC<PhaseCardProps> = ({ wyckoff }) => {
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
          <div style={{ color: '#5C6478', fontSize: '10px' }}>置信度</div>
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
            <div style={{ color: '#5C6478', fontSize: '11px', marginBottom: '4px' }}>识别形态</div>
            <span className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${patternConf.badge}`}>
              {patternConf.label}
            </span>
          </div>
          <div className="text-right">
            <div style={{ color: '#5C6478', fontSize: '10px', marginBottom: '4px' }}>信号说明</div>
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
            <span style={{ color: '#00D4AA', fontSize: '11px', fontWeight: '600', letterSpacing: '0.04em' }}>复合人动向</span>
          </div>
          <p style={{ color: '#A0A8B8', fontSize: '12px', lineHeight: '1.6' }}>{wyckoff.compositeManBehavior}</p>
        </div>
      </div>
    </div>
  );
};
