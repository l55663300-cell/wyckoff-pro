import React, { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { AnalysisResult } from '../../types';
import { formatPrice } from '../../utils/formatters';
import { formatV23Report } from '../../utils/reportFormatter';
import { useT } from '../../i18n';

interface ReportPanelProps {
  result: AnalysisResult;
  activeTimeframe?: string;
}

const PHASE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  accumulation: { label: '吸筹区',   color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  markup:       { label: '上涨趋势', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  distribution: { label: '派发区',   color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  markdown:     { label: '下跌趋势', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
};
const PATTERN_CONFIG: Record<string, { label: string }> = {
  spring:   { label: '弹簧效应 Spring' },
  upthrust: { label: '假突破 UpThrust' },
  sos:      { label: '力量迹象 SOS' },
  sow:      { label: '弱势迹象 SOW' },
  none:     { label: '无明显形态' },
};
const DIR_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  long:    { label: '建议做多', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  short:   { label: '建议做空', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  neutral: { label: '建议观望', color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
};

export const ReportPanel: React.FC<ReportPanelProps> = ({ result, activeTimeframe }) => {
  const t = useT();
  const [copied, setCopied]   = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const { wyckoff, scoring, risk, sentiment, news, primaryIndicators, symbol } = result;
  const phaseConf   = PHASE_CONFIG[wyckoff.phase]   ?? PHASE_CONFIG.accumulation;
  const patternConf = PATTERN_CONFIG[wyckoff.pattern] ?? PATTERN_CONFIG.none;
  const dirConf     = DIR_CONFIG[scoring.direction]  ?? DIR_CONFIG.neutral;
  const poc         = result.volumeProfile.find((n) => n.isPOC);

  const r618    = result.fibonacci.retracements.find((r) => r.level === 0.618);
  const ext1272 = result.fibonacci.extensions.find((e) => e.level === 1.272);
  const waitBreakout = ext1272?.price ?? result.price * 1.015;
  const waitSupport  = poc?.priceMid ?? r618?.price ?? result.price * 0.985;

  const probColor = scoring.probability >= 70 ? '#059669' : scoring.probability >= 55 ? '#d97706' : '#dc2626';
  const probBg    = scoring.probability >= 70 ? '#ecfdf5' : scoring.probability >= 55 ? '#fffbeb' : '#fef2f2';
  const probBd    = scoring.probability >= 70 ? '#a7f3d0' : scoring.probability >= 55 ? '#fde68a' : '#fecaca';

  const handleCopy = () => {
    navigator.clipboard.writeText(formatV23Report(result));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // 风险模拟文字
  const entryMid = ((risk.entryLow + risk.entryHigh) / 2);
  const riskPct  = Math.abs((risk.stopLoss - entryMid) / entryMid * 100).toFixed(1);

  const TF_LABELS: Record<string, string> = { '1d': '日线', '4h': '4小时', '1h': '1小时', '15m': '15分钟' };

  // 多维度打分（5维）
  const dims = result.scoring.dims;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', borderBottom: '1px solid var(--bd-light)',
        background: phaseConf.bg, flexShrink: 0,
      }}>
        <span style={{ fontSize: 18 }}>🦞</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>{t.report.title}</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>
            {new Date(result.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        <button
          onClick={handleCopy}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            borderRadius: 20, border: '1px solid var(--bd)', background: '#fff',
            color: copied ? '#059669' : 'var(--t3)', cursor: 'pointer', fontSize: 11,
          }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? t.report.copied : t.report.copy}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── 交易计划 ── */}
        <section>
          {/* 英雄卡：方向 + 概率大字突出 */}
          <div style={{
            background: dirConf.bg,
            border: `1.5px solid ${dirConf.border}`,
            borderRadius: 14,
            padding: '14px 16px',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}>
            <div>
              <div style={{ fontSize: 10, color: dirConf.color, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{t.report.tradeDirection}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: dirConf.color, lineHeight: 1 }}>
                {scoring.direction === 'long' ? t.report.dirLong : scoring.direction === 'short' ? t.report.dirShort : t.report.dirNeutral}
              </div>
              <div style={{ fontSize: 11, color: dirConf.color, opacity: 0.7, marginTop: 4 }}>
                {PHASE_CONFIG[wyckoff.phase]?.label ?? wyckoff.phase}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: probColor, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{t.report.confidence}</div>
              <div style={{
                fontFamily: 'JetBrains Mono, monospace', fontWeight: 900,
                fontSize: 36, color: probColor, lineHeight: 1,
              }}>
                {scoring.probability.toFixed(0)}<span style={{ fontSize: 16, fontWeight: 700 }}>%</span>
              </div>
              <div style={{
                marginTop: 5, display: 'inline-block',
                padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                background: probBg, color: probColor, border: `1px solid ${probBd}`,
              }}>
                {scoring.probability >= 70 ? t.report.signalStrong : scoring.probability >= 55 ? t.report.signalMedium : t.report.signalWeak}
              </div>
            </div>
          </div>

          {scoring.direction !== 'neutral' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

              {/* 表格式布局 */}
              <div style={{
                background: '#fff', border: '1px solid var(--bd)', borderRadius: 12, overflow: 'hidden',
              }}>
                {[
                  {
                    label: t.report.entry,
                    value: `$${formatPrice(risk.entryLow, symbol)} – $${formatPrice(risk.entryHigh, symbol)}`,
                    valueColor: '#2563eb',
                    sub: poc ? `POC @ $${formatPrice(poc.priceMid, symbol)}` : '',
                  },
                  {
                    label: t.report.stopLoss,
                    value: `$${formatPrice(risk.stopLoss, symbol)}`,
                    valueColor: '#dc2626',
                    sub: '',
                  },
                  {
                    label: t.report.tp1,
                    value: `$${formatPrice(risk.target1, symbol)}`,
                    valueColor: '#059669',
                    sub: '50%仓位',
                  },
                  {
                    label: t.report.tp2,
                    value: `$${formatPrice(risk.target2, symbol)}`,
                    valueColor: '#2563eb',
                    sub: '30%仓位',
                  },
                  {
                    label: t.report.tp3,
                    value: `$${formatPrice(risk.target3, symbol)}`,
                    valueColor: '#7c3aed',
                    sub: '移动止损 · 20%仓',
                  },
                ].map((row, i, arr) => (
                  <div
                    key={row.label}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '9px 14px',
                      borderBottom: i < arr.length - 1 ? '1px solid var(--bd-light)' : 'none',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 13, color: 'var(--t2)', fontWeight: 500 }}>{row.label}</span>
                      {row.sub && <span style={{ fontSize: 11, color: 'var(--t4)', marginLeft: 6 }}>({row.sub})</span>}
                    </div>
                    <span style={{
                      fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
                      fontSize: 14, color: row.valueColor,
                    }}>{row.value}</span>
                  </div>
                ))}
              </div>

              {/* 仓位/杠杆/盈亏比/时间止损 */}
              <div style={{
                marginTop: 8, padding: '10px 14px', borderRadius: 12,
                background: '#f8faff', border: '1px solid #e0e7ff',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                {[
                  { icon: '💰', label: t.report.position, value: `${risk.positionSize}%`, color: '#059669' },
                  { icon: '⚡', label: t.report.leverage, value: `${risk.leverage}x`, color: '#2563eb' },
                  { icon: '📊', label: t.report.rr, value: risk.riskReward.toFixed(2), color: risk.rrWarning ? '#dc2626' : '#d97706', warn: risk.rrWarning },
                  { icon: '⏱️', label: t.report.timeStop, value: `${risk.timeStopHours}H`, color: '#7c3aed' },
                ].map((p) => (
                  <div key={p.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--t3)' }}>{p.icon} {p.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {'warn' in p && p.warn && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                          background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5',
                        }}>{t.report.rrWarn}</span>
                      )}
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 13, color: p.color }}>{p.value}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* 风险模拟 */}
              <div style={{
                marginTop: 8, padding: '10px 12px', borderRadius: 10,
                background: scoring.direction === 'long' ? '#f0fdf4' : '#fff1f2',
                border: `1px solid ${scoring.direction === 'long' ? '#86efac' : '#fca5a5'}`,
                borderLeft: `3px solid ${scoring.direction === 'long' ? '#16a34a' : '#dc2626'}`,
              }}>
                <p style={{ fontSize: 12, color: 'var(--t2)', margin: 0, lineHeight: 1.65 }}>
                  {scoring.direction === 'long' ? '✅' : '⚠️'} 风险模拟：若在 ${formatPrice(entryMid, symbol)} 入场，
                  止损 ${formatPrice(risk.stopLoss, symbol)} → 亏损约 <strong>{riskPct}%</strong>，
                  {parseFloat(riskPct) <= 3 ? '未超风控线。' : '注意控制仓位。'}
                </p>
              </div>

            </div>
          ) : (
            /* 观望 */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--bg-subtle)', borderRadius: 10 }}>
                <span style={{ fontSize: 24 }}>👀</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t1)' }}>{t.report.waitTitle}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{t.report.waitSub}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ padding: '10px 12px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#059669', marginBottom: 4 }}>{t.report.waitBreakout}</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#059669' }}>${formatPrice(waitBreakout, symbol)}</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{t.report.waitBreakoutSub}</div>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#2563eb', marginBottom: 4 }}>{t.report.waitSupport}</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#2563eb' }}>${formatPrice(waitSupport, symbol)}</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{t.report.waitSupportSub}</div>
                </div>
              </div>
            </div>
          )}
        </section>

        <div className="divider" />

        {/* ── AI 大模型深度解读（有 LLM 时优先显示，无时显示本地 AI 摘要）── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>{t.report.aiDepth}</span>
            {result.aiReport ? (
              <span style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                background: 'rgba(99,179,237,0.12)', color: '#63b3ed', border: '1px solid rgba(99,179,237,0.3)',
              }}>{result.aiReport.generatedBy}</span>
            ) : (
              <span style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                background: 'rgba(240,180,41,0.1)', color: 'var(--primary)', border: '1px solid rgba(240,180,41,0.25)',
              }}>{t.report.localEngine}</span>
            )}
          </div>

          {result.aiReport ? (
            <>
              {/* AI 综合摘要 */}
              <div style={{
                padding: '12px 14px', borderRadius: 10, marginBottom: 10,
                background: 'rgba(99,179,237,0.06)', border: '1px solid rgba(99,179,237,0.2)',
                borderLeft: '3px solid #63b3ed',
              }}>
                <p style={{ fontSize: 13, color: 'var(--t1)', lineHeight: 1.75, margin: 0 }}>
                  {result.aiReport.summary}
                </p>
              </div>

              {/* AI 威科夫阶段解读 */}
              {result.aiReport.wyckoffAnalysis && (
                <div style={{
                  padding: '10px 12px', borderRadius: 10, marginBottom: 10,
                  background: 'rgba(154,230,180,0.06)', border: '1px solid rgba(154,230,180,0.2)',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#68d391', marginBottom: 4 }}>{t.report.wyckoffStage}</div>
                  <p style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.65, margin: 0 }}>
                    {result.aiReport.wyckoffAnalysis}
                  </p>
                </div>
              )}

              {/* AI 关键结构 */}
              {result.aiReport.keyStructure && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                  {[
                    { label: t.report.supportLevel, value: result.aiReport.keyStructure.support, color: '#68d391' },
                    { label: t.report.resistanceLevel, value: result.aiReport.keyStructure.resistance, color: '#f87171' },
                    { label: t.report.chipZone, value: result.aiReport.keyStructure.chipZone, color: '#63b3ed' },
                    { label: t.report.volumeState, value: result.aiReport.keyStructure.volumeState, color: '#f0b429' },
                  ].map(item => (
                    <div key={item.label} style={{
                      padding: '8px 10px', borderRadius: 8,
                      background: 'var(--bg3)', border: '1px solid var(--border)',
                    }}>
                      <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 3 }}>{item.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: item.color }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* AI 综合结论 */}
              {result.aiReport.wyckoffConclusion && (
                <div style={{
                  padding: '10px 12px', borderRadius: 10,
                  background: 'rgba(240,180,41,0.06)', border: '1px solid rgba(240,180,41,0.2)',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--primary)', marginBottom: 4 }}>{t.report.aiConclusion}</div>
                  <p style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.65, margin: 0 }}>
                    {result.aiReport.wyckoffConclusion}
                  </p>
                </div>
              )}
            </>
          ) : (
            /* 无 AI 大模型时展示本地逻辑摘要 */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{
                padding: '12px 14px', borderRadius: 10,
                background: 'rgba(240,180,41,0.04)', border: '1px solid rgba(240,180,41,0.18)',
                borderLeft: '3px solid var(--primary)',
              }}>
                <p style={{ fontSize: 13, color: 'var(--t1)', lineHeight: 1.75, margin: 0 }}>
                  当前市场处于 <strong>{PHASE_CONFIG[wyckoff.phase]?.label ?? wyckoff.phase}</strong>，
                  综合多周期技术指标与量价结构，
                  {scoring.direction === 'long'
                    ? '看多信号占优，建议关注入场区间。'
                    : scoring.direction === 'short'
                    ? '看空信号占优，建议谨慎追多。'
                    : '信号尚不明朗，建议等待方向确认后再介入。'}
                </p>
              </div>
              {[
                {
                  icon: '📐', title: '斐波那契 + VP',
                  content: `入场区 $${formatPrice(risk.entryLow, symbol)}–$${formatPrice(risk.entryHigh, symbol)} 对应61.8%回撤${poc ? `，POC @ $${formatPrice(poc.priceMid, symbol)} 双重支撑` : ''}`,
                },
                {
                  icon: '📰', title: '情绪 & 资金费率',
                  content: `恐贪指数 ${sentiment.fearGreed}（${sentiment.fearGreedLabel}）${Math.abs(sentiment.fearGreedChange) >= 15 ? `，情绪剧变 ${sentiment.fearGreedChange > 0 ? '+' : ''}${sentiment.fearGreedChange}` : ''}；资金费率 ${(sentiment.fundingRate * 100).toFixed(4)}%${sentiment.fundingRateAlert ? ' ⚠️过热' : '，正常'}`,
                },
              ].map((item) => (
                <div key={item.icon} style={{ display: 'flex', gap: 10, padding: '9px 11px', borderRadius: 10, background: 'var(--bg-subtle)', border: '1px solid var(--bd-light)' }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t1)', marginBottom: 2 }}>{item.title}</div>
                    <p style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.6, margin: 0 }}>{item.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--bd-light)' }}>
          <span style={{ fontSize: 11, color: 'var(--t4)', fontStyle: 'italic' }}>{t.report.tagline}</span>
          <button
            onClick={() => setShowRaw(!showRaw)}
            style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--t4)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {t.report.rawText} {showRaw ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        </div>
        {showRaw && (
          <div style={{ padding: '12px', borderRadius: 10, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, lineHeight: 1.7, background: 'var(--bg-subtle)', border: '1px solid var(--bd)', color: 'var(--t2)', whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
            {formatV23Report(result)}
          </div>
        )}
      </div>
    </div>
  );
};
