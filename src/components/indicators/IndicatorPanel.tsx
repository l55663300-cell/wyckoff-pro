import React, { useState, useEffect } from 'react';
import { IndicatorValues } from '../../types';
import { formatPrice } from '../../utils/formatters';

interface IndicatorPanelProps {
  indicators: IndicatorValues;
  symbol: string;
}

const RSI_STATE = {
  overbought: { label: '超买', color: 'var(--bear)', bg: 'var(--bear-bg)' },
  oversold:   { label: '超卖', color: 'var(--bull)', bg: 'var(--bull-bg)' },
  neutral:    { label: '中性', color: 'var(--t3)',   bg: 'var(--bg-subtle)' },
};
const MACD_STATE = {
  golden:  { label: '金叉 ↑', color: 'var(--bull)', bg: 'var(--bull-bg)' },
  dead:    { label: '死叉 ↓', color: 'var(--bear)', bg: 'var(--bear-bg)' },
  neutral: { label: '中性',   color: 'var(--t3)',   bg: 'var(--bg-subtle)' },
};
const BB_POSITION = {
  above_upper: { label: '上轨以上', color: 'var(--bear)', bg: 'var(--bear-bg)' },
  near_upper:  { label: '接近上轨', color: 'var(--warn)', bg: 'var(--warn-bg)' },
  middle:      { label: '中轨区间', color: 'var(--t3)',   bg: 'var(--bg-subtle)' },
  near_lower:  { label: '接近下轨', color: 'var(--bull)', bg: 'var(--bull-bg)' },
  below_lower: { label: '下轨以下', color: 'var(--bull)', bg: 'var(--bull-bg)' },
};
const ADX_STATE = {
  strong_bull: { label: '强趋势多头', color: 'var(--bull)', bg: 'var(--bull-bg)' },
  strong_bear: { label: '强趋势空头', color: 'var(--bear)', bg: 'var(--bear-bg)' },
  trending:    { label: '弱趋势',     color: 'var(--warn)', bg: 'var(--warn-bg)' },
  ranging:     { label: '震荡',       color: 'var(--t3)',   bg: 'var(--bg-subtle)' },
};

export const IndicatorPanel: React.FC<IndicatorPanelProps> = ({ indicators, symbol }) => {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const rsiConf  = RSI_STATE[indicators.rsiState];
  const macdConf = MACD_STATE[indicators.macdState];
  const bbConf   = BB_POSITION[indicators.bbPosition];
  const adxConf  = ADX_STATE[indicators.adxState];

  const rows = [
    {
      name: 'RSI (14)',
      icon: '📈',
      value: indicators.rsi.toFixed(1),
      state: rsiConf.label,
      stateColor: rsiConf.color,
      stateBg: rsiConf.bg,
      bar: indicators.rsi,
      barColor: rsiConf.color,
      desc: `超卖区 <30 · 超买区 >70`,
    },
    {
      name: 'MACD (12,26,9)',
      icon: '⚡',
      value: indicators.macdHist > 0 ? `+${indicators.macdHist.toFixed(2)}` : indicators.macdHist.toFixed(2),
      state: macdConf.label,
      stateColor: macdConf.color,
      stateBg: macdConf.bg,
      desc: indicators.macdHist > 0 ? '柱状图为正，动能偏多' : '柱状图为负，动能偏空',
    },
    {
      name: '布林带 (20,2)',
      icon: '〰️',
      value: formatPrice(indicators.bbMiddle, symbol),
      state: bbConf.label,
      stateColor: bbConf.color,
      stateBg: bbConf.bg,
      desc: `↓${formatPrice(indicators.bbLower, symbol)}  ·  ↑${formatPrice(indicators.bbUpper, symbol)}`,
    },
    {
      name: 'ATR (14)',
      icon: '🎯',
      value: formatPrice(indicators.atr, symbol),
      state: `止损 -${formatPrice(indicators.atr * 2, symbol)}`,
      stateColor: 'var(--info)',
      stateBg: 'var(--info-bg)',
      desc: '建议止损距离（2×ATR）',
    },
    {
      name: 'ADX (14)',
      icon: '💪',
      value: indicators.adx.toFixed(1),
      state: adxConf.label,
      stateColor: adxConf.color,
      stateBg: adxConf.bg,
      bar: Math.min(100, indicators.adx * 2),
      barColor: adxConf.color,
      desc: `+DI ${indicators.diPlus.toFixed(1)}  ·  -DI ${indicators.diMinus.toFixed(1)}`,
    },
  ];

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
        {rows.map((row) => (
          <div
            key={row.name}
            style={{
              background: 'var(--bg2)', borderRadius: 12, padding: '12px 14px',
              border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}
          >
            {/* 顶部：图标+名称 / 状态badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16 }}>{row.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>{row.name}</span>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
                background: row.stateBg, color: row.stateColor,
                border: `1px solid ${row.stateColor}30`,
              }}>{row.state}</span>
            </div>
            {/* 数值大字 */}
            <div style={{
              fontFamily: 'JetBrains Mono, monospace', fontWeight: 800, fontSize: 22,
              color: 'var(--t1)', letterSpacing: '-0.5px',
            }}>{row.value}</div>
            {/* 进度条（RSI / ADX） */}
            {row.bar !== undefined && (
              <div style={{
                height: 5, borderRadius: 99, background: 'var(--bg3)', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  width: `${row.bar}%`, background: row.barColor,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            )}
            {/* 辅助说明 */}
            <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'JetBrains Mono, monospace' }}>{row.desc}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div className="card-title" style={{ marginBottom: 12 }}>技术指标</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
        {rows.map((row) => (
          <div
            key={row.name}
            style={{
              background: 'var(--bg-subtle)', borderRadius: 12, padding: '10px 12px',
              border: '1px solid var(--bd-light)',
            }}
          >
            <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 4, fontWeight: 500 }}>{row.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 4 }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 14, color: 'var(--t1)' }}>{row.value}</span>
              <span className="badge" style={{ background: row.stateBg, color: row.stateColor, fontSize: 10, padding: '1px 6px' }}>{row.state}</span>
            </div>
            {row.bar !== undefined && (
              <div className="level-bar" style={{ marginBottom: row.desc ? 4 : 0 }}>
                <div
                  className="h-full rounded-full progress-bar"
                  style={{ width: `${row.bar}%`, background: row.barColor }}
                />
              </div>
            )}
            {row.desc && (
              <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>{row.desc}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
