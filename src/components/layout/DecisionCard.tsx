import React from 'react';
import { AnalysisResult } from '../../types';
import { formatPrice } from '../../utils/formatters';

interface Props {
  result: AnalysisResult;
}

const ENTRY_STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  immediate: { label: '🟢 可立即入场', color: '#16a34a', bg: '#f0fdf4' },
  ready:     { label: '⏳ 等待回调入场', color: '#ca8a04', bg: '#fefce8' },
  wait:      { label: '等待回调', color: '#64748b', bg: '#f8fafc' },
};

const DecisionCard: React.FC<Props> = ({ result }) => {
  const direction = result.scoring.direction;
  const isLong = direction === 'long';
  const isShort = direction === 'short';
  const color = isLong ? 'var(--green)' : isShort ? 'var(--red)' : 'var(--t3)';
  const colorHex = isLong ? '#34C759' : isShort ? '#FF3B30' : '#AEAEB2';

  const phaseLabel =
    result.wyckoff.phase === 'accumulation' ? '吸筹阶段' :
    result.wyckoff.phase === 'markup'        ? '上涨阶段' :
    result.wyckoff.phase === 'distribution'  ? '派发阶段' : '下跌阶段';

  const dirLabel = isLong ? '做多建议' : isShort ? '做空建议' : '中性观望';
  const dirTag   = isLong ? '做多' : isShort ? '做空' : '观望';

  const risk = result.risk;

  const copyReport = () => {
    const ai = result.aiReport;
    const text = ai
      ? `【威科夫PRO策略报告】\n${ai.direction} | 评分 ${ai.score}\n入场：${ai.entryLow}–${ai.entryHigh}\n止损：${ai.stopLoss}\n目标1：${ai.target1}  目标2：${ai.target2}\n仓位：${ai.positionAdvice}\n\n${ai.summary}`
      : result.report;
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius-card)',
      padding: 16,
      boxShadow: 'var(--shadow-card)',
    }}>
      {/* 标题行 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>🦞 威科夫PRO策略报告</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 20, border: `1px solid ${colorHex}50`,
            background: `${colorHex}15`, color, fontWeight: 700,
          }}>
            {dirTag}
          </span>
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 20,
            background: 'var(--bg3)', color: 'var(--t2)', border: '1px solid var(--border)',
            fontFamily: 'monospace',
          }}>
            评分 {result.scoring.score.toFixed(1)}
          </span>
        </div>
      </div>

      {/* 方向 + 概率条 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 24, fontWeight: 800, color }}>{dirLabel}</span>
        <span style={{ fontSize: 13, color: 'var(--t2)' }}>信心概率 {result.scoring.probability}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, marginBottom: 8, overflow: 'hidden' }}>
        <div style={{ height: 6, borderRadius: 3, width: `${result.scoring.probability}%`, background: color, transition: 'width 0.7s' }} />
      </div>

      {/* 入场状态标签 */}
      {result.scoring.entryStatus && result.scoring.entryStatus !== 'wait' && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 12, fontWeight: 600,
          color: ENTRY_STATUS_LABELS[result.scoring.entryStatus].color,
          background: ENTRY_STATUS_LABELS[result.scoring.entryStatus].bg,
          borderRadius: 20, padding: '3px 12px', marginBottom: 14,
        }}>
          {ENTRY_STATUS_LABELS[result.scoring.entryStatus].label}
        </div>
      )}

      {/* 关键参数网格 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', fontSize: 13, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 3 }}>入场区间</div>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: 'var(--t1)' }}>
            ${formatPrice(risk.entryLow)} – ${formatPrice(risk.entryHigh)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 3 }}>动态止损 (ATR×2)</div>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: 'var(--red)' }}>${formatPrice(risk.stopLoss)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 3 }}>保守止盈 (50%)</div>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: 'var(--green)' }}>${formatPrice(risk.target1)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 3 }}>理想止盈 (30%)</div>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: 'var(--green)' }}>${formatPrice(risk.target2)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 3 }}>激进止盈 (20%)</div>
          <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13, color: 'var(--t2)' }}>移动止损</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 3 }}>仓位 / 杠杆 / 盈亏比</div>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: 'var(--t1)' }}>
            {risk.positionSize}% · {risk.leverage}x · {risk.riskReward.toFixed(2)}
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 3 }}>时间止损</div>
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--t2)' }}>
            {risk.timeStopHours}小时内未脱离成本区±0.5% → 建议平仓
          </div>
        </div>
      </div>

      {/* 阶段摘要 */}
      <div style={{
        fontSize: 12, color: 'var(--t2)', borderTop: '1px solid var(--border-light)',
        paddingTop: 10, marginBottom: 12, lineHeight: 1.7,
      }}>
        📋 {phaseLabel} · 评分维度：威科夫{result.scoring.dims.wyckoff.toFixed(0)} / 量能{result.scoring.dims.volume.toFixed(0)} / 动量{result.scoring.dims.momentum.toFixed(0)} / 情绪{result.scoring.dims.sentiment.toFixed(0)}
      </div>

      <button
        onClick={copyReport}
        style={{
          width: '100%', padding: '10px 0', borderRadius: 10, border: '1px solid var(--border)',
          background: 'var(--bg3)', color: 'var(--t1)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          transition: 'background 0.15s',
        }}
      >
        📄 复制策略到剪贴板
      </button>
    </div>
  );
};

export default DecisionCard;
