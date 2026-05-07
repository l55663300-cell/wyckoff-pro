import React, { useState, useEffect } from 'react';
import { getUserSubscription, getRemainingQuota, type UserSubscription } from '../../utils/subscriptionStore';
import { useT, getLang } from '../../i18n';

export type QuotaBlockReason = 'no_subscription' | 'daily_limit' | 'hourly_limit' | 'expired' | 'info' | 'unknown';

interface Props {
  onClose: () => void;
  onRecharge: () => void;
  reason?: string;
  uid?: string;
}

function inferBlockType(reason: string): QuotaBlockReason {
  if (!reason) return 'info';
  // 支持中英文关键字检测
  if (reason.includes('未开通') || reason.includes('no_subscription') || reason.toLowerCase().includes('no subscription')) return 'no_subscription';
  if (reason.includes('到期') || reason.includes('expired')) return 'expired';
  if (reason.includes('今日') || reason.includes('daily') || reason.toLowerCase().includes('daily limit')) return 'daily_limit';
  if (reason.includes('频繁') || reason.includes('小时') || reason.includes('hourly') || reason.toLowerCase().includes('too many')) return 'hourly_limit';
  return 'unknown';
}

function fmtDate(iso: string) {
  const locale = getLang() === 'en' ? 'en-US' : 'zh-CN';
  try { return new Date(iso).toLocaleDateString(locale); } catch { return iso; }
}

export function CreditsModal({ onClose, onRecharge, reason = '', uid }: Props) {
  const t = useT();
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
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{t.credits.subscriptionOk}</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 20 }}>{sub.planName}</div>

            <div style={{
              background: 'var(--bg3)', borderRadius: 12, padding: '16px',
              marginBottom: 20, textAlign: 'left',
            }}>
              {[
                { label: t.credits.todayRemain, value: `${quota.daily} / ${quota.total} ` + t.credits.times(1).replace('1', '') },
                { label: t.credits.expireAt, value: fmtDate(sub.expireAt) },
                { label: t.credits.dailyLimit, value: `${sub.dailyLimit} ` + t.credits.times(1).replace('1 ', '') },
                { label: t.credits.hourlyLimit, value: `${sub.hourlyLimit} ` + t.credits.times(1).replace('1', '') + '/h' },
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
            }}>{t.credits.upgradeBtn}</button>

            <button onClick={onClose} style={{
              width: '100%', padding: 11, borderRadius: 10,
              background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)',
              cursor: 'pointer', fontSize: 14,
            }}>{t.credits.close}</button>
          </div>
        </div>
      );
    }
  }

  type ContentDef = { icon: string; title: string; desc: string; btnLabel: string; showUpgrade?: boolean };
  const contentMap: Record<QuotaBlockReason, ContentDef> = {
    no_subscription: {
      icon: '🔒',
      title: t.credits.noSubscriptionTitle,
      desc: t.credits.noSubscriptionDesc,
      btnLabel: t.credits.noSubscriptionBtn,
    },
    daily_limit: {
      icon: '📊',
      title: t.credits.dailyLimitTitle,
      desc: reason || t.credits.dailyLimitDesc,
      btnLabel: t.credits.dailyLimitBtn,
      showUpgrade: true,
    },
    hourly_limit: {
      icon: '⏳',
      title: t.credits.hourlyLimitTitle,
      desc: reason || t.credits.hourlyLimitDesc,
      btnLabel: t.credits.hourlyLimitBtn,
      showUpgrade: true,
    },
    expired: {
      icon: '⌛',
      title: t.credits.expiredTitle,
      desc: reason || t.credits.expiredDesc,
      btnLabel: t.credits.expiredBtn,
    },
    info: {
      icon: '⚡',
      title: t.credits.infoTitle,
      desc: t.credits.infoDesc,
      btnLabel: t.credits.infoBtn,
    },
    unknown: {
      icon: '⚡',
      title: t.credits.unknownTitle,
      desc: reason || t.credits.unknownDesc,
      btnLabel: t.credits.unknownBtn,
    },
  };

  const content = contentMap[resolvedType];

  const perks = [t.credits.perk1, t.credits.perk2, t.credits.perk3, t.credits.perk4];

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
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>{t.credits.perksTitle}</div>
            {perks.map(item => (
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
            {t.credits.upgradeHint}<br />
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>{t.credits.upgradeHintSub}</span>
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
        }}>{t.credits.laterBtn}</button>
      </div>
    </div>
  );
}
