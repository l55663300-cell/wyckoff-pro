import React, { useState, useEffect } from 'react';
import { getUserSubscription, getRemainingQuota, type UserSubscription } from '../../utils/subscriptionStore';

export type QuotaBlockReason = 'no_subscription' | 'daily_limit' | 'hourly_limit' | 'expired' | 'info' | 'unknown';

interface Props {
  onClose: () => void;
  onRecharge: () => void;
  reason?: string;
  uid?: string;
}

function inferBlockType(reason: string): QuotaBlockReason {
  if (!reason) return 'info';
  if (reason.includes('未开通')) return 'no_subscription';
  if (reason.includes('到期')) return 'expired';
  if (reason.includes('今日')) return 'daily_limit';
  if (reason.includes('频繁') || reason.includes('小时')) return 'hourly_limit';
  return 'unknown';
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('zh-CN'); } catch { return iso; }
}

export function CreditsModal({ onClose, onRecharge, reason = '', uid }: Props) {
  const resolvedType = inferBlockType(reason);

  const [sub, setSub] = useState<UserSubscription | null>(null);
  const [quota, setQuota] = useState<{ daily: number; total: number; expireAt: string | null; isActive: boolean } | null>(null);

  useEffect(() => {
    if (!uid) return;
    Promise.all([getUserSubscription(uid), getRemainingQuota(uid)]).then(([s, q]) => {
      setSub(s);
      setQuota(q);
    });
  }, [uid]);

  const isSubActive = sub && new Date(sub.expireAt) > new Date();

  // ── 信息态：用户主动点击状态栏 ──
  if (resolvedType === 'info') {
    if (isSubActive && sub && quota) {
      return (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)',
          zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
          <div style={{
            background: 'var(--bg2)', border: '1.5px solid var(--border)',
            borderRadius: 20, padding: '32px 28px', maxWidth: 380, width: '90%',
            textAlign: 'center', position: 'relative',
          }}>
            <button onClick={onClose} style={{
              position: 'absolute', top: 14, right: 16, background: 'none', border: 'none',
              color: 'var(--t3)', fontSize: 20, cursor: 'pointer',
            }}>×</button>

            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>订阅正常</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 20 }}>{sub.planName}</div>

            <div style={{
              background: 'var(--bg3)', borderRadius: 12, padding: '16px',
              marginBottom: 20, textAlign: 'left',
            }}>
              {[
                { label: '今日剩余', value: `${quota.daily} / ${quota.total} 次` },
                { label: '订阅到期', value: fmtDate(sub.expireAt) },
                { label: '每日上限', value: `${sub.dailyLimit} 次 AI 分析` },
                { label: '每小时限流', value: `${sub.hourlyLimit} 次/小时` },
              ].map(item => (
                <div key={item.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 0', borderBottom: '1px solid var(--border)',
                  fontSize: 13,
                }}>
                  <span style={{ color: 'var(--t3)' }}>{item.label}</span>
                  <span style={{ color: 'var(--t1)', fontWeight: 600 }}>{item.value}</span>
                </div>
              ))}
            </div>

            <button onClick={onRecharge} style={{
              width: '100%', padding: 11, borderRadius: 10, marginBottom: 10,
              background: 'transparent', color: 'var(--primary)',
              border: '1px solid rgba(240,180,41,0.4)', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}>升级套餐 / 提前续费</button>

            <button onClick={onClose} style={{
              width: '100%', padding: 11, borderRadius: 10,
              background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)',
              cursor: 'pointer', fontSize: 14,
            }}>关闭</button>
          </div>
        </div>
      );
    }
  }

  type ContentDef = { icon: string; title: string; desc: string; btnLabel: string; showUpgrade?: boolean };
  const contentMap: Record<QuotaBlockReason, ContentDef> = {
    no_subscription: {
      icon: '🔒',
      title: '需要订阅才能使用',
      desc: '订阅后即可解锁每日 AI 策略分析功能，套餐最低 $9.9 起。',
      btnLabel: '查看套餐',
    },
    daily_limit: {
      icon: '📊',
      title: '今日配额已用完',
      desc: reason || '今日 AI 分析次数已达上限，明日 00:00 自动重置。',
      btnLabel: '升级套餐',
      showUpgrade: true,
    },
    hourly_limit: {
      icon: '⏳',
      title: '请求过于频繁',
      desc: reason || '本小时请求次数较多，请稍后再试。',
      btnLabel: '升级套餐',
      showUpgrade: true,
    },
    expired: {
      icon: '⌛',
      title: '订阅已到期',
      desc: reason || '您的订阅已到期，续费后立即恢复使用。',
      btnLabel: '立即续费',
    },
    info: {
      icon: '⚡',
      title: '订阅中心',
      desc: '订阅套餐后即可使用 AI 策略分析功能。',
      btnLabel: '查看套餐',
    },
    unknown: {
      icon: '⚡',
      title: '暂时无法使用',
      desc: reason || '请检查订阅状态后重试。',
      btnLabel: '查看套餐',
    },
  };

  const content = contentMap[resolvedType];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)',
      zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--bg2)', border: '1.5px solid var(--border)',
        borderRadius: 20, padding: '36px 30px', maxWidth: 400, width: '90%',
        textAlign: 'center', position: 'relative',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 14, right: 16, background: 'none', border: 'none',
          color: 'var(--t3)', fontSize: 20, cursor: 'pointer', lineHeight: 1,
        }}>×</button>

        <div style={{ fontSize: 48, marginBottom: 14 }}>{content.icon}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', marginBottom: 10 }}>{content.title}</div>
        <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.75, marginBottom: 22 }}>
          {content.desc}
        </div>

        {(resolvedType === 'no_subscription' || resolvedType === 'expired' || resolvedType === 'info') && (
          <div style={{
            background: 'rgba(240,180,41,0.05)', border: '1px solid rgba(240,180,41,0.22)',
            borderRadius: 12, padding: '14px 16px', marginBottom: 22, textAlign: 'left',
          }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>订阅后可享受</div>
            {['每日 30~200 次 AI 策略分析', '全套威科夫技术指标', '实时行情 + 订单薄热力图', '套餐最低 $9.9/月起'].map(item => (
              <div key={item} style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 4 }}>
                <span style={{ color: 'var(--green)', marginRight: 6 }}>✓</span>{item}
              </div>
            ))}
          </div>
        )}

        {content.showUpgrade && (
          <div style={{
            background: 'rgba(240,180,41,0.05)', border: '1px solid rgba(240,180,41,0.22)',
            borderRadius: 12, padding: '12px 16px', marginBottom: 22, fontSize: 13, color: 'var(--t2)', lineHeight: 1.7,
          }}>
            升级至更高套餐可获得更多每日次数<br />
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>专业版：80次/天 · 机构版：200次/天</span>
          </div>
        )}

        <button onClick={onRecharge} style={{
          width: '100%', padding: 13, borderRadius: 10, marginBottom: 12,
          background: 'linear-gradient(135deg, #f0b429, #e8920a)',
          color: '#000', fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer',
        }}>{content.btnLabel}</button>

        <button onClick={onClose} style={{
          width: '100%', padding: 11, borderRadius: 10,
          background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)',
          cursor: 'pointer', fontSize: 14,
        }}>稍后再说</button>
      </div>
    </div>
  );
}
