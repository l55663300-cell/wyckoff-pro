import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { loadContent } from '../utils/contentStore';
import { getUnreadCountAsync } from '../utils/noticeStore';
import { getActivePlans, type SubscriptionPlan } from '../utils/subscriptionStore';
import { useT, toggleLang } from '../i18n';

export default function LandingPage({ onOpenLogin }: { onOpenLogin?: () => void }) {
  const { navigate } = useApp();
  const openLogin = onOpenLogin ?? (() => navigate('login'));
  const [bannerVisible, setBannerVisible] = useState(true);
  const content = loadContent();
  const [noticeCount, setNoticeCount] = useState(0);
  const t = useT();
  useEffect(() => { void getUnreadCountAsync().then(setNoticeCount); }, []);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);

  useEffect(() => {
    getActivePlans().then(setPlans).catch(() => {});
  }, []);

  // 静态后备套餐（数据库为空时展示）
  const staticPlans = [
    { id: 'basic', name: t.landing.staticPlanBasicName, priceUsd: 68, durationDays: 30, dailyLimit: 30, popular: false, perks: t.landing.staticPlanBasicPerks, cycle: 'monthly' as const },
    { id: 'pro', name: t.landing.staticPlanProName, priceUsd: 168, durationDays: 30, dailyLimit: 100, popular: true, perks: t.landing.staticPlanProPerks, cycle: 'monthly' as const },
    { id: 'elite', name: t.landing.staticPlanEliteName, priceUsd: 388, durationDays: 90, dailyLimit: 200, popular: false, perks: t.landing.staticPlanElitePerks, cycle: 'quarterly' as const },
  ];
  const displayPlans = plans.length > 0 ? plans : staticPlans;

  const navLinks = [
    { label: t.landing.navFeatures, id: 'section-features' },
    { label: t.landing.navPricing,  id: 'section-pricing' },
    { label: t.landing.navAbout,    id: 'section-about' },
  ];

  const stats = [
    { num: '500+',    label: t.landing.statsCoins },
    { num: '14',      label: t.landing.statsSteps },
    { num: t.landing.statsRealtime, label: t.landing.statsRealtime === 'Real-time Data' ? 'Data' : '行情数据' },
    { num: 'AI',      label: t.landing.statsAI },
  ];

  // 统计区固定展示
  const statsFixed = [
    { num: '500+',   label: t.landing.statsCoins },
    { num: '14',     label: t.landing.statsSteps },
    { num: t.landing.statsRealtime, label: '' },
    { num: 'AI',     label: t.landing.statsAI },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg1)', color: 'var(--t1)' }}>

      {/* 活动Banner */}
      {bannerVisible && content.banner.enabled && (
        <div className="activity-banner">
          {content.banner.text}
          <span style={{ cursor: 'pointer', color: '#fff', textDecoration: 'underline', fontWeight: 700, marginLeft: 8 }}
            onClick={() => openLogin()}>{content.banner.linkText} →</span>
          <button className="activity-banner-close" onClick={() => setBannerVisible(false)}>×</button>
        </div>
      )}

      {/* 导航栏 */}
      <nav style={{
        position: 'sticky', top: 0,
        background: 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border-light)',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 32px', height: 60, zIndex: 100,
        boxShadow: '0 1px 0 rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 16, color: 'var(--t1)' }}>
          <span style={{ fontSize: 22 }}>🦞</span> {t.landing.brandName}
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {navLinks.map(({ label, id }) => (
            <a key={id} href={`#${id}`}
              onClick={e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }}
              style={{ fontSize: 14, color: 'var(--t2)', textDecoration: 'none', cursor: 'pointer' }}>{label}</a>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={toggleLang} style={{
            padding: '7px 14px', borderRadius: 10, fontSize: 12, cursor: 'pointer',
            background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)', fontWeight: 700,
          }}>{t.nav.langToggle}</button>
          <button onClick={() => openLogin()} style={{
            padding: '7px 18px', borderRadius: 10, fontSize: 13, cursor: 'pointer',
            background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)',
          }}>{t.landing.navLogin}</button>
          <button onClick={() => openLogin()} style={{
            padding: '7px 18px', borderRadius: 10, fontSize: 13, cursor: 'pointer',
            background: 'var(--primary)', color: '#fff', fontWeight: 600, border: 'none',
            boxShadow: '0 2px 8px rgba(0,122,255,0.25)',
          }}>{t.landing.navRegister}</button>
        </div>
      </nav>

      {/* Hero区 */}
      <div style={{
        minHeight: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '60px 20px',
        background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,122,255,0.06) 0%, transparent 60%)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px',
          borderRadius: 20, background: 'rgba(0,122,255,0.08)', border: '1px solid rgba(0,122,255,0.18)',
          color: 'var(--primary)', fontSize: 12, marginBottom: 24, fontWeight: 500,
        }}>🚀 {t.landing.heroBadge}</div>

        <h1 style={{ fontSize: 'clamp(32px,6vw,64px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 20, letterSpacing: -1, color: 'var(--t1)' }}>
          {content.hero.title.split('威科夫').length > 1 ? (
            <>{content.hero.title.split('威科夫')[0]}<span style={{ color: 'var(--primary)' }}>威科夫</span>{content.hero.title.split('威科夫').slice(1).join('威科夫')}</>
          ) : content.hero.title}
        </h1>
        <p style={{ fontSize: 18, color: 'var(--t2)', maxWidth: 560, lineHeight: 1.7, marginBottom: 40 }}>
          {content.hero.subtitle}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => openLogin()} style={{
            padding: '14px 32px', borderRadius: 12,
            background: 'var(--primary)',
            color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,122,255,0.35)',
            transition: 'all .15s',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 28px rgba(0,122,255,0.42)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,122,255,0.35)'; }}
          >{content.hero.ctaText}</button>
          <button style={{
            padding: '14px 32px', borderRadius: 12, background: 'var(--bg2)',
            color: 'var(--t1)', fontSize: 15, border: '1px solid var(--border)', cursor: 'pointer',
            boxShadow: 'var(--shadow-card)',
          }}>{t.landing.heroLearnMore}</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 14 }}>{content.hero.ctaSubText}</div>

        {/* 模拟截图预览 */}
        <div style={{
          marginTop: 60, width: '100%', maxWidth: 900,
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16,
          overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
        }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
            <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 8 }}>wyckoff-pro.pages.dev/app</span>
          </div>
          <div style={{ display: 'flex', height: 300 }}>
            <div style={{ width: 140, borderRight: '1px solid var(--border)', padding: 10, fontSize: 11 }}>
              <div style={{ color: 'var(--t3)', marginBottom: 8 }}>{t.landing.previewWatchlist}</div>
              {['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT'].map((s, i) => (
                <div key={s} style={{
                  color: i === 0 ? '#f0b429' : 'var(--t2)', fontWeight: i === 0 ? 700 : 400,
                  background: i === 0 ? 'rgba(240,180,41,0.1)' : 'transparent',
                  padding: '6px 8px', borderRadius: 6, marginBottom: 4,
                }}>{s}</div>
              ))}
            </div>
            <div style={{ flex: 1, padding: 12 }}>
              <div style={{ color: 'var(--t3)', fontSize: 11, marginBottom: 8 }}>{t.landing.previewChart}</div>
              <MockKlineChart />
            </div>
            <div style={{ width: 200, borderLeft: '1px solid var(--border)', padding: 12, fontSize: 11, position: 'relative', overflow: 'hidden' }}>
              <div style={{ color: 'var(--t3)', marginBottom: 8 }}>{t.landing.previewReport}</div>
              <div style={{ background: 'rgba(0,200,150,0.1)', border: '1px solid rgba(0,200,150,0.2)', borderRadius: 6, padding: '6px 10px', color: 'var(--green)', fontWeight: 700, marginBottom: 8 }}>{t.landing.previewSignal}</div>
              <div style={{ color: 'var(--t2)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{t.landing.previewDetails}</div>
              {/* 锁定遮罩 */}
              <div onClick={() => openLogin()} style={{
                position: 'absolute', inset: 0, background: 'rgba(6,13,24,0.82)', backdropFilter: 'blur(3px)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
              }}>
                <div style={{ fontSize: 22 }}>🔒</div>
                <div style={{ fontSize: 12, color: 'var(--t2)', textAlign: 'center', lineHeight: 1.5 }}>{t.landing.previewLockTitle}<br />{t.landing.previewLockSub}</div>
                <button style={{ background: '#f0b429', color: '#000', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 6, padding: '5px 14px', cursor: 'pointer' }}>{t.landing.previewLockBtn}</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 统计数字 */}
      <div style={{
        display: 'flex', gap: 40, justifyContent: 'center', flexWrap: 'wrap',
        padding: '40px 20px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)',
      }}>
        {[
          { num: '500+', label: t.landing.statsCoins },
          { num: '14',   label: t.landing.statsSteps },
          { num: t.landing.statsRealtime, label: '' },
          { num: 'AI',   label: t.landing.statsAI },
        ].map((s, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#f0b429' }}>{s.num}</div>
            {s.label && <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 4 }}>{s.label}</div>}
          </div>
        ))}
      </div>

      {/* 功能介绍 */}
      <div id="section-features" style={{ padding: '80px 20px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 32, fontWeight: 700, marginBottom: 12 }}>{t.landing.featuresTitle}</h2>
        <p style={{ textAlign: 'center', color: 'var(--t2)', marginBottom: 48 }}>{t.landing.featuresSubtitle}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {t.landing.featuresList.map(f => (
            <div key={f.title} style={{
              background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 28,
              transition: 'all .2s',
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12, background: 'rgba(240,180,41,0.1)',
                border: '1px solid rgba(240,180,41,0.2)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 22, marginBottom: 16,
              }}>{f.icon}</div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 定价 */}
      <div id="section-pricing" style={{ padding: '80px 20px', background: 'var(--bg2)' }}>
        <h2 style={{ textAlign: 'center', fontSize: 32, fontWeight: 700, marginBottom: 12 }}>{t.landing.pricingTitle}</h2>
        <p style={{ textAlign: 'center', color: 'var(--t2)', marginBottom: 48 }}>{t.landing.pricingSubtitle}</p>
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 960, margin: '0 auto' }}>
          {displayPlans.slice(0, 4).map(plan => (
            <div key={plan.id} style={{
              background: 'var(--bg1)', border: `1px solid ${plan.popular ? '#f0b429' : 'var(--border)'}`,
              borderRadius: 16, padding: '32px 28px', width: 260, position: 'relative', flexShrink: 0,
            }}>
              {plan.popular && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: '#f0b429', color: '#000', fontSize: 11, fontWeight: 700,
                  padding: '3px 14px', borderRadius: 20,
                }}>{t.landing.pricingPopular}</div>
              )}
              <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 8 }}>{plan.name}</div>
              <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--t1)' }}>
                ${plan.priceUsd}<span style={{ fontSize: 16, fontWeight: 400, color: 'var(--t2)' }}>
                  {' '}USDT / {plan.durationDays >= 365 ? t.landing.pricingPerYear : plan.durationDays >= 90 ? t.landing.pricingPerQuarter : t.landing.pricingPerMonth}
                </span>
              </div>
              <div style={{ fontSize: 13, color: '#f0b429', margin: '8px 0 20px' }}>
                {t.landing.pricingAIQueries(plan.dailyLimit)}
              </div>
              <ul style={{ listStyle: 'none', marginBottom: 24, padding: 0 }}>
                {(plan.perks ?? []).map(p => (
                  <li key={p} style={{ fontSize: 13, color: 'var(--t2)', padding: '5px 0' }}>✓ {p}</li>
                ))}
              </ul>
              <button onClick={() => openLogin()} style={{
                width: '100%', padding: 12, borderRadius: 10,
                background: 'linear-gradient(135deg, #f0b429, #e8920a)',
                color: '#000', fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer',
              }}>{t.landing.pricingCta}</button>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div id="section-about" style={{ textAlign: 'center', padding: '40px 20px', borderTop: '1px solid var(--border)', color: 'var(--t3)', fontSize: 13 }}>
        {t.landing.footerCopy}
      </div>
    </div>
  );
}

// 模拟K线图
function MockKlineChart() {
  const bars = React.useMemo(() => {
    return Array.from({ length: 40 }, (_, i) => ({
      h: 40 + Math.sin(i * 0.4) * 60 + Math.random() * 60,
      up: Math.sin(i * 0.3 + 1) > 0,
    }));
  }, []);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 180 }}>
      {bars.map((b, i) => (
        <div key={i} style={{
          flex: 1, height: b.h,
          background: b.up ? 'rgba(0,200,150,0.7)' : 'rgba(255,77,109,0.7)',
          borderRadius: 1,
        }} />
      ))}
    </div>
  );
}
