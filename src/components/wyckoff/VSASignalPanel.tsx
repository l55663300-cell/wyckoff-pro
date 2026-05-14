import React from 'react';
import { KLine } from '../../types';
import { calcEMA } from '../../calc/ma';

interface VSASignal {
  type: 'up_thrust' | 'spring' | 'no_supply' | 'no_demand' | 'effort_up' | 'effort_down' | 'ema_spring' | 'ema_rejection';
  label: string;
  desc: string;
  color: string;
  icon: string;
  barIndex: number;
}

function detectVSASignals(klines: KLine[]): VSASignal[] {
  if (klines.length < 20) return [];

  const signals: VSASignal[] = [];
  const avg20Vol = klines.slice(-20).reduce((a, k) => a + k.volume, 0) / 20;

  // 预计算 EMA20 / EMA50 序列
  const ema20Arr = calcEMA(klines, 20);
  const ema50Arr = calcEMA(klines, 50);

  // 取最近30根，逐根检测
  const recent = klines.slice(-30);
  for (let i = 1; i < recent.length; i++) {
    const k = recent[i];
    const prev = recent[i - 1];
    // 对应原始 klines 中的真实下标
    const realIdx = klines.length - 30 + i;
    const isUp = k.close > k.open;
    const spread = k.high - k.low;
    const avgSpread = recent.slice(Math.max(0, i - 10), i).reduce((a, b) => a + (b.high - b.low), 0) / Math.min(10, i);
    const isHighVol = k.volume > avg20Vol * 1.5;
    const isLowVol  = k.volume < avg20Vol * 0.6;
    const isWide    = spread > avgSpread * 1.3;
    const isNarrow  = spread < avgSpread * 0.7;
    const closeNearTop = k.close > k.low + spread * 0.7;
    const closeNearBot = k.close < k.low + spread * 0.3;

    // ── 新增：均线弹簧信号 ──
    const ema20 = ema20Arr[realIdx];
    const ema50 = ema50Arr[realIdx];
    if (ema20 !== undefined && isUp && Math.abs(k.low - ema20) / ema20 < 0.005) {
      signals.push({
        type: 'ema_spring', label: 'EMA弹簧', desc: '回踩EMA20不破，浮动供应清除',
        color: '#0d9488', icon: '↗', barIndex: i,
      });
    }
    if (ema50 !== undefined && !isUp && Math.abs(k.high - ema50) / ema50 < 0.005) {
      signals.push({
        type: 'ema_rejection', label: 'EMA承压', desc: '反弹至EMA50遇阻，下跌延续',
        color: '#dc2626', icon: '↘', barIndex: i,
      });
    }

    // No Supply（缩量上涨）
    if (isUp && isLowVol && isNarrow) {
      signals.push({ type: 'no_supply', label: '无供给', desc: '缩量窄幅上涨，空头无力', color: '#059669', icon: '↑', barIndex: i });
    }
    // No Demand（缩量下跌）
    else if (!isUp && isLowVol && isNarrow) {
      signals.push({ type: 'no_demand', label: '无需求', desc: '缩量窄幅下跌，多头无力', color: '#dc2626', icon: '↓', barIndex: i });
    }
    // Effort Up（放量有效上涨）
    else if (isUp && isHighVol && isWide && closeNearTop) {
      signals.push({ type: 'effort_up', label: '有效做多', desc: '放量宽幅上涨，主力推升', color: '#2563eb', icon: '▲', barIndex: i });
    }
    // Effort Down（放量有效下跌）
    else if (!isUp && isHighVol && isWide && closeNearBot) {
      signals.push({ type: 'effort_down', label: '有效做空', desc: '放量宽幅下跌，主力打压', color: '#d97706', icon: '▼', barIndex: i });
    }
    // Up Thrust（放量假突破）
    else if (isHighVol && k.high > prev.high && closeNearBot) {
      signals.push({ type: 'up_thrust', label: 'UpThrust', desc: '高量假突破后回落，警惕陷阱', color: '#dc2626', icon: '⚡', barIndex: i });
    }
    // Spring（低量假跌破后收复）
    else if (isLowVol && k.low < prev.low && closeNearTop) {
      signals.push({ type: 'spring', label: 'Spring', desc: '低量假跌破后收复，吸筹信号', color: '#059669', icon: '🌀', barIndex: i });
    }
  }

  // 返回最近 5 条（倒序，最新在前）
  return signals.slice(-5).reverse();
}

interface Props {
  klines: KLine[];
}

export const VSASignalPanel: React.FC<Props> = ({ klines }) => {
  const signals = detectVSASignals(klines);

  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 8 }}>
        📊 VSA 量价信号
      </div>
      {signals.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--t4)', textAlign: 'center', padding: '8px 0' }}>
          暂无明显量价信号
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {signals.map((s, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', borderRadius: 7,
                background: `${s.color}0d`, border: `1px solid ${s.color}25`,
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1, color: s.color, flexShrink: 0 }}>{s.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{s.label}</div>
                <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
