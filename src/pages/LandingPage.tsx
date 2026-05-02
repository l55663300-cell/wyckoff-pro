import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { loadContent } from '../utils/contentStore';
import { loadNotices, getUnreadCount } from '../utils/noticeStore';
import { getActivePlans, type SubscriptionPlan } from '../utils/subscriptionStore';

export default function LandingPage({ onOpenLogin }: { onOpenLogin?: () => void }) {
  const { navigate } = useApp();
  const openLogin = onOpenLogin ?? (() => navigate('login'));
  const [bannerVisible, setBannerVisible] = useState(true);
  const content = loadContent();
  const noticeCount = getUnreadCount();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);

  useEffect(() => {
    getActivePlans().then(setPlans).catch(() => {});
  }, []);

  // 静态后备套餐（数据库为空时展示）
  const staticPlans = [
    { id: 'basic', name: '基础版', priceUsd: 68, durationDays: 30, dailyLimit: 30, popular: false, perks: ['每日30次AI分析', '500+币种支持', '全功能访问', '实时行情数据'], cycle: 'monthly' as const },
    { id: 'pro', name: '专业版', priceUsd: 168, durationDays: 30, dailyLimit: 100, popular: true, perks: ['每日100次AI分析', '500+币种支持', '全功能访问', '优先响应速度', '策略历史记录'], cycle: 'monthly' as const },
    { id: 'elite', name: '旗舰版', priceUsd: 388, durationDays: 90, dailyLimit: 200, popular: false, perks: ['每日200次AI分析', '500+币种支持', '最快响应速度', '邮件信号推送', '专属客服支持'], cycle: 'quarterly' as const },
  ];
  const displayPlans = plans.length > 0 ? plans : staticPlans;

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
          <span style={{ fontSize: 22 }}>🦞</span> AI威科夫Pro
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {['功能介绍', '定价', '关于我们'].map(t => (
            <a key={t} href="#" style={{ fontSize: 14, color: 'var(--t2)', textDecoration: 'none' }}>{t}</a>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => openLogin()} style={{
            padding: '7px 18px', borderRadius: 10, fontSize: 13, cursor: 'pointer',
            background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)',
          }}>登录</button>
          <button onClick={() => openLogin()} style={{
            padding: '7px 18px', borderRadius: 10, fontSize: 13, cursor: 'pointer',
            background: 'var(--primary)', color: '#fff', fontWeight: 600, border: 'none',
            boxShadow: '0 2px 8px rgba(0,122,255,0.25)',
          }}>免费注册</button>
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
        }}>🚀 专业机构级量化分析工具</div>

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
          }}>了解更多 →</button>
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
              <div style={{ color: 'var(--t3)', marginBottom: 8 }}>自选列表</div>
              {['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT'].map((s, i) => (
                <div key={s} style={{
                  color: i === 0 ? '#f0b429' : 'var(--t2)', fontWeight: i === 0 ? 700 : 400,
                  background: i === 0 ? 'rgba(240,180,41,0.1)' : 'transparent',
                  padding: '6px 8px', borderRadius: 6, marginBottom: 4,
                }}>{s}</div>
              ))}
            </div>
            <div style={{ flex: 1, padding: 12 }}>
              <div style={{ color: 'var(--t3)', fontSize: 11, marginBottom: 8 }}>BTC/USDT · 1H · K线图</div>
              <MockKlineChart />
            </div>
            <div style={{ width: 200, borderLeft: '1px solid var(--border)', padding: 12, fontSize: 11, position: 'relative', overflow: 'hidden' }}>
              <div style={{ color: 'var(--t3)', marginBottom: 8 }}>AI策略报告</div>
              <div style={{ background: 'rgba(0,200,150,0.1)', border: '1px solid rgba(0,200,150,0.2)', borderRadius: 6, padding: '6px 10px', color: 'var(--green)', fontWeight: 700, marginBottom: 8 }}>▲ 做多信号 82分</div>
              <div style={{ color: 'var(--t2)', lineHeight: 1.5 }}>入场：$94,200<br />止损：$91,800<br />目标：$99,500<br />盈亏比：2.3:1</div>
              {/* 锁定遮罩 */}
              <div onClick={() => openLogin()} style={{
                position: 'absolute', inset: 0, background: 'rgba(6,13,24,0.82)', backdropFilter: 'blur(3px)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
              }}>
                <div style={{ fontSize: 22 }}>🔒</div>
                <div style={{ fontSize: 12, color: 'var(--t2)', textAlign: 'center', lineHeight: 1.5 }}>登录后查看<br />完整分析报告</div>
                <button style={{ background: '#f0b429', color: '#000', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 6, padding: '5px 14px', cursor: 'pointer' }}>免费注册</button>
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
          { num: '500+', label: '支持币种' },
          { num: '14步', label: '分析流程' },
          { num: '实时', label: '行情数据' },
          { num: 'AI驱动', label: '个性化策略' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#f0b429' }}>{s.num}</div>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 功能介绍 */}
      <div style={{ padding: '80px 20px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 32, fontWeight: 700, marginBottom: 12 }}>为专业交易者打造</h2>
        <p style={{ textAlign: 'center', color: 'var(--t2)', marginBottom: 48 }}>整合威科夫理论、量化指标与 AI 分析，让每一次决策都有据可依</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {[
            { icon: '📊', title: '威科夫阶段识别', desc: '自动识别积累、上涨、派发、下跌四大阶段，结合量价关系给出置信度评分' },
            { icon: '🤖', title: 'AI个性化策略', desc: '基于实时数据向 AI 提问，获得专属的入场位、止损、目标价与仓位建议' },
            { icon: '📈', title: '多周期共振分析', desc: '同时分析日线/4H/1H/15m四个周期，找出多周期共振的最优入场时机' },
            { icon: '🛡️', title: '动态风控计划', desc: '基于 ATR 和斐波那契自动计算止损止盈，确保每笔交易盈亏比 ≥ 1.5:1' },
            { icon: '📰', title: '实时舆情监控', desc: '整合14个中英文加密新闻源，自动分类情绪分析，辅助判断市场情绪' },
            { icon: '🔥', title: '订单簿热力图', desc: '实时监控大单买卖墙，识别关键支撑压制位，预判机构资金方向' },
          ].map(f => (
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
      <div style={{ padding: '80px 20px', background: 'var(--bg2)' }}>
        <h2 style={{ textAlign: 'center', fontSize: 32, fontWeight: 700, marginBottom: 12 }}>简单透明的定价</h2>
        <p style={{ textAlign: 'center', color: 'var(--t2)', marginBottom: 48 }}>灵活订阅，无隐藏费用</p>
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
                }}>最受欢迎</div>
              )}
              <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 8 }}>{plan.name}</div>
              <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--t1)' }}>
                ¥{plan.priceUsd}<span style={{ fontSize: 16, fontWeight: 400, color: 'var(--t2)' }}>
                  {' '}/ {plan.durationDays >= 90 ? '季' : plan.durationDays >= 365 ? '年' : '月'}
                </span>
              </div>
              <div style={{ fontSize: 13, color: '#f0b429', margin: '8px 0 20px' }}>
                每日 {plan.dailyLimit} 次 AI查询
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
              }}>立即订阅</button>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '40px 20px', borderTop: '1px solid var(--border)', color: 'var(--t3)', fontSize: 13 }}>
        © 2026 AI威科夫Pro · 仅供技术学习参考，不构成投资建议
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
