import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import {
  loadQueries, calcAccuracy, getWeeklyTrend, labelQueryOutcome,
  loadFavCoins, saveFavCoins, addFavCoin, removeFavCoin,
  loadInviteStats,
} from '../utils/queryStore';
import { getUserSubOrders, getUserSubscription, type UserSubscription } from '../utils/subscriptionStore';
import type { QueryRecord, AccuracyStats, InviteStats } from '../utils/queryStore';
import type { SubscriptionOrder } from '../utils/subscriptionStore';

type UserTab = 'history' | 'accuracy' | 'favorites' | 'invite' | 'rechargeLog' | 'security' | 'feedback';

const FEEDBACK_TYPES = ['🐛 Bug反馈', '💡 功能建议', '🚨 投诉', '💬 其他'];

export default function UserPage() {
  const { user, logout, navigate, getQuota } = useApp();
  const [activeTab, setActiveTab] = useState<UserTab>('history');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.name ?? '');
  const [nameError, setNameError] = useState('');
  const [fbType, setFbType] = useState(0);
  const [fbText, setFbText] = useState('');
  const [toast, setToast] = useState('');
  const [showLogout, setShowLogout] = useState(false);

  // 真实数据 state
  const [history, setHistory] = useState<QueryRecord[]>([]);
  const [accuracy, setAccuracy] = useState<AccuracyStats | null>(null);
  const [weekTrend, setWeekTrend] = useState<number[]>(new Array(7).fill(0));
  const [favCoins, setFavCoins] = useState<string[]>([]);
  const [inviteStats, setInviteStats] = useState<InviteStats>({ totalInvited: 0, totalPaid: 0, totalReward: 0, records: [] });
  const [orders, setOrders] = useState<SubscriptionOrder[]>([]);
  const [newFavInput, setNewFavInput] = useState('');

  const [sub, setSub] = useState<UserSubscription | null>(null);
  const [quota, setQuota] = useState<{ daily: number; total: number; expireAt: string | null; isActive: boolean }>({ daily: 0, total: 0, expireAt: null, isActive: false });

  // 修改密码弹窗
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwOld, setPwOld] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwNew2, setPwNew2] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');

  // 修改邮箱弹窗
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  // 修改密码处理
  const handleChangePassword = async () => {
    setPwError('');
    if (!pwNew || pwNew.length < 8) { setPwError('新密码至少8位'); return; }
    if (pwNew !== pwNew2) { setPwError('两次密码不一致'); return; }
    if (!/(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d])/.test(pwNew)) {
      setPwError('密码需包含字母、数字和特殊字符');
      return;
    }
    setPwLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwNew });
      if (error) throw error;
      showToast('密码修改成功 ✅');
      setShowPwModal(false);
      setPwOld(''); setPwNew(''); setPwNew2('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setPwError(msg || '修改失败，请重试');
    } finally {
      setPwLoading(false);
    }
  };

  // 修改邮箱处理
  const handleChangeEmail = async () => {
    setEmailError('');
    if (!newEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      setEmailError('请输入正确的邮箱格式');
      return;
    }
    setEmailLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) throw error;
      setEmailSent(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setEmailError(msg || '修改失败，请重试');
    } finally {
      setEmailLoading(false);
    }
  };

  // 加载所有真实数据
  const reloadData = useCallback(async () => {
    if (!user) return;
    const uid = user.uid;
    setHistory(loadQueries(uid));
    setAccuracy(calcAccuracy(uid));
    setWeekTrend(getWeeklyTrend(uid));
    setFavCoins(loadFavCoins(uid));
    setInviteStats(loadInviteStats(uid));
    const [subData, ordersData, quotaData] = await Promise.all([
      getUserSubscription(uid),
      getUserSubOrders(uid),
      getQuota(),
    ]);
    setSub(subData);
    setOrders(ordersData);
    setQuota(quotaData);
  }, [user, getQuota]);

  useEffect(() => { reloadData(); }, [reloadData]);

  if (!user) { navigate('login'); return null; }

  const avatar = user.name?.[0]?.toUpperCase() ?? 'U';

  const tdStyle: React.CSSProperties = {
    padding: '12px 14px', borderBottom: '1px solid rgba(30,45,66,0.4)',
    color: 'var(--t2)', fontSize: 13,
  };
  const thStyle: React.CSSProperties = {
    padding: '10px 14px', textAlign: 'left', fontSize: 11,
    color: 'var(--t3)', borderBottom: '1px solid var(--border)', fontWeight: 600,
  };

  const tabDefs: { key: UserTab; label: string }[] = [
    { key: 'history', label: '查询历史' },
    { key: 'accuracy', label: '准确率统计' },
    { key: 'favorites', label: '收藏币种' },
    { key: 'invite', label: '邀请返利' },
    { key: 'rechargeLog', label: '充值记录' },
    { key: 'security', label: '账户安全' },
    { key: 'feedback', label: '反馈中心' },
  ];

  // 会员状态
  const proExpireDate = sub?.expireAt ? new Date(sub.expireAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-') : null;
  const todayUsed = sub ? (sub.lastUsedDate === new Date().toISOString().slice(0, 10) ? sub.dailyUsed : 0) : 0;
  const dailyLimit = sub?.dailyLimit ?? 0;
  const progressPct = dailyLimit > 0 ? Math.min(100, Math.round((todayUsed / dailyLimit) * 100)) : 0;

  // 本周趋势最大值（用于相对高度）
  const maxTrend = Math.max(...weekTrend, 1);

  // 充值记录状态映射
  const orderStatusMap: Record<string, { text: string; color: string }> = {
    pending: { text: '审核中', color: '#f0b429' },
    confirmed: { text: '已确认到账', color: 'var(--green)' },
    rejected: { text: '已拒绝', color: 'var(--red)' },
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg1)', color: 'var(--t1)' }}>
      {/* 顶部导航 */}
      <nav style={{
        position: 'sticky', top: 0, background: 'rgba(6,13,24,0.98)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 32px', height: 60, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 16 }}>
          <span style={{ fontSize: 22 }}>🦞</span> AI威科夫Pro
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => navigate('app')} style={{ padding: '7px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)' }}>返回分析</button>
          <button onClick={() => setShowLogout(true)} style={{ padding: '7px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)' }}>退出登录</button>
        </div>
      </nav>

      <div style={{ padding: '40px 20px', maxWidth: 900, margin: '0 auto' }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>个人中心</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>

          {/* 左侧账户卡片 */}
          <div>
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
              {/* 头像 */}
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'linear-gradient(135deg, #f0b429, #e8920a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, fontWeight: 700, color: '#000', marginBottom: 12,
              }}>{avatar}</div>

              <div style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 4 }}>{user.email}</div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                {editingName ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
                    <input
                      value={nameInput}
                      onChange={e => { setNameInput(e.target.value); setNameError(''); }}
                      maxLength={16}
                      style={{ background: 'var(--bg3)', border: '1.5px solid var(--primary)', color: 'var(--t1)', fontSize: 14, fontWeight: 600, borderRadius: 5, padding: '2px 8px', outline: 'none', width: 130 }}
                    />
                    <button onClick={() => {
                      if (nameInput.trim().length < 2) { setNameError('至少2个字符'); return; }
                      setEditingName(false); showToast('昵称已更新 ✅');
                    }} style={{ background: 'var(--primary)', border: 'none', color: '#000', borderRadius: 5, padding: '3px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>保存</button>
                  </div>
                ) : (
                  <>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>{nameInput || user.name}</span>
                    {quota.isActive && (
                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'linear-gradient(90deg,#f0b429,#e8920a)', color: '#000', marginLeft: 8 }}>
                        {sub?.planName ?? 'Pro'}会员
                      </span>
                    )}
                    <button onClick={() => setEditingName(true)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--t3)', padding: '0 4px' }}>✏️</button>
                  </>
                )}
              </div>
              {nameError && <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 6 }}>{nameError}</div>}
              <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>UID #{user.uid}</div>

              {/* 次数 */}
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 4 }}>剩余查询次数</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: '#f0b429' }}>
                    {quota.isActive ? quota.daily : user.credits}
                  </div>
                </div>
                <button onClick={() => navigate('recharge')} style={{ padding: '7px 16px', borderRadius: 8, background: '#f0b429', color: '#000', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' }}>充值</button>
              </div>

              {/* 会员状态 */}
              {quota.isActive && sub ? (
                <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--t2)', marginBottom: 8 }}>
                    <span>{sub.planName}</span>
                    <span style={{ color: 'var(--primary)' }}>到期：{proExpireDate}</span>
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${progressPct}%`, height: '100%', background: 'linear-gradient(90deg, #f0b429, #e8920a)', borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6 }}>
                    今日已用 {todayUsed}/{dailyLimit} 次
                  </div>
                </div>
              ) : (
                <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: 16, marginBottom: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>暂无有效订阅</div>
                  <button onClick={() => navigate('recharge')} style={{ padding: '5px 14px', borderRadius: 8, background: '#f0b429', color: '#000', fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer' }}>立即订阅</button>
                </div>
              )}

              {/* 本周趋势 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 6 }}>本周查询次数趋势</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36 }}>
                  {weekTrend.map((h, i) => (
                    <div key={i} style={{
                      flex: 1,
                      height: `${Math.max(8, Math.round((h / maxTrend) * 100))}%`,
                      borderRadius: '2px 2px 0 0',
                      background: i === 6 ? 'var(--primary)' : 'rgba(240,180,41,0.35)',
                    }} />
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>
                  {['周一','周二','周三','周四','周五','周六','今日'].map(d => <span key={d}>{d}</span>)}
                </div>
              </div>

              {/* 快捷按钮 */}
              <div style={{ display: 'flex', gap: 8 }}>
                {(['history', 'security'] as UserTab[]).map((t, i) => (
                  <button key={t} onClick={() => setActiveTab(t)} style={{
                    flex: 1, padding: '5px 12px', borderRadius: 6, fontSize: 12,
                    border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', cursor: 'pointer',
                  }}>{i === 0 ? '查询历史' : '账户安全'}</button>
                ))}
              </div>
            </div>
          </div>

          {/* 右侧Tab内容 */}
          <div>
            {/* Tab导航 */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 0, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
              {tabDefs.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                  padding: '8px 14px', fontSize: 13, fontWeight: 600,
                  color: activeTab === t.key ? 'var(--primary)' : 'var(--t3)',
                  background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  borderBottom: `2px solid ${activeTab === t.key ? 'var(--primary)' : 'transparent'}`,
                  marginBottom: -1, transition: 'all .15s',
                }}>{t.label}</button>
              ))}
            </div>

            {/* ── 查询历史 ── */}
            {activeTab === 'history' && (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>查询历史</span>
                  <span style={{ fontSize: 12, color: 'var(--t3)' }}>最近30条 · 点击标记结果</span>
                </div>
                {history.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--t4)', fontSize: 13 }}>
                    暂无查询记录，去<button onClick={() => navigate('app')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, padding: '0 2px' }}>分析页面</button>开始第一次查询
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      {['币种','方向','评分','威科夫阶段','时间','结果'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {history.slice(0, 30).map((row) => (
                        <tr key={row.id}
                          onMouseEnter={e => (e.currentTarget.querySelectorAll('td') as any).forEach((td: any) => td.style.background = 'rgba(240,180,41,0.04)')}
                          onMouseLeave={e => (e.currentTarget.querySelectorAll('td') as any).forEach((td: any) => td.style.background = '')}>
                          <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--t1)' }}>{row.symbol.replace('USDT', '/USDT')}</td>
                          <td style={tdStyle}>
                            <span style={{
                              color: row.direction.includes('多') || row.direction === 'long' ? 'var(--green)'
                                : row.direction.includes('空') || row.direction === 'short' ? 'var(--red)' : '#f0b429',
                              fontWeight: 700,
                            }}>{row.direction}</span>
                          </td>
                          <td style={{ ...tdStyle, color: '#f0b429' }}>{row.score}</td>
                          <td style={{ ...tdStyle, fontSize: 12 }}>{row.phase}</td>
                          <td style={{ ...tdStyle, fontSize: 11, color: 'var(--t3)' }}>
                            {new Date(row.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={tdStyle}>
                            {row.outcome ? (
                              <span style={{ color: row.outcome === 'win' ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                                {row.outcome === 'win' ? '✓ 盈利' : '✗ 亏损'}
                              </span>
                            ) : (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => { labelQueryOutcome(user.uid, row.id, 'win'); reloadData(); showToast('已标记盈利'); }} style={{ padding: '2px 7px', fontSize: 11, border: '1px solid var(--green)', background: 'transparent', color: 'var(--green)', borderRadius: 4, cursor: 'pointer' }}>盈</button>
                                <button onClick={() => { labelQueryOutcome(user.uid, row.id, 'loss'); reloadData(); showToast('已标记亏损'); }} style={{ padding: '2px 7px', fontSize: 11, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red)', borderRadius: 4, cursor: 'pointer' }}>亏</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ── 准确率统计 ── */}
            {activeTab === 'accuracy' && (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginTop: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>AI 方向准确率统计</div>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 20 }}>基于您过去查询后市场实际走势的跟踪统计（需手动标记结果）</div>
                {accuracy && accuracy.labeled > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                    <div>
                      <div style={{
                        width: 72, height: 72, borderRadius: '50%',
                        background: `conic-gradient(var(--primary) 0% ${accuracy.overall}%, rgba(255,255,255,0.08) ${accuracy.overall}% 100%)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                      }}>
                        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: 'var(--primary)' }}>
                          {accuracy.overall}%
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', textAlign: 'center', marginTop: 6 }}>综合胜率</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      {[
                        { label: '做多方向', val: accuracy.longTotal > 0 ? `${Math.round((accuracy.longWin / accuracy.longTotal) * 100)}%` : '—', sub: accuracy.longTotal > 0 ? `(${accuracy.longWin}/${accuracy.longTotal})` : '', color: 'var(--green)' },
                        { label: '做空方向', val: accuracy.shortTotal > 0 ? `${Math.round((accuracy.shortWin / accuracy.shortTotal) * 100)}%` : '—', sub: accuracy.shortTotal > 0 ? `(${accuracy.shortWin}/${accuracy.shortTotal})` : '', color: 'var(--red)' },
                        { label: '已标记次数', val: `${accuracy.labeled} 次`, sub: '', color: 'var(--t1)' },
                        { label: '未标记次数', val: `${accuracy.unlabeled} 次待评`, sub: '', color: 'var(--t3)' },
                      ].map(row => (
                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--t2)', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                          <span>{row.label}</span>
                          <span style={{ color: row.color, fontWeight: 600 }}>{row.val} <small>{row.sub}</small></span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t4)', fontSize: 13 }}>
                    暂无标记数据，在"查询历史"中为每条记录标记盈/亏，统计将自动更新
                  </div>
                )}
                <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 14, fontSize: 12, color: 'var(--t2)', lineHeight: 1.7 }}>
                  💡 <strong style={{ color: 'var(--t1)' }}>如何提高准确率参考价值？</strong><br />
                  每次查询完成后，在查询历史中标记"盈/亏"，系统将自动更新胜率统计。
                </div>
                <div style={{ marginTop: 16 }}>
                  <button onClick={() => setActiveTab('history')} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', cursor: 'pointer' }}>去标记历史结果 →</button>
                </div>
              </div>
            )}

            {/* ── 收藏币种 ── */}
            {activeTab === 'favorites' && (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>收藏的币种</span>
                  <span style={{ fontSize: 12, color: 'var(--t3)' }}>点击快速进入分析</span>
                </div>
                {favCoins.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t4)', fontSize: 13 }}>
                    暂无收藏，在分析页搜索币种后点击 ★ 即可收藏
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                    {favCoins.map(coin => (
                      <div key={coin} onClick={() => navigate('app')}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .15s' }}
                        onMouseEnter={e => { (e.currentTarget as any).style.borderColor = 'var(--primary)'; (e.currentTarget as any).style.color = 'var(--primary)'; }}
                        onMouseLeave={e => { (e.currentTarget as any).style.borderColor = 'var(--border)'; (e.currentTarget as any).style.color = ''; }}>
                        {coin}
                        <span onClick={ev => {
                          ev.stopPropagation();
                          removeFavCoin(user.uid, coin);
                          setFavCoins(loadFavCoins(user.uid));
                          showToast('已取消收藏');
                        }} style={{ color: 'var(--t3)', fontSize: 11, marginLeft: 2, cursor: 'pointer' }}>✕</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* 手动添加收藏 */}
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <input
                    value={newFavInput}
                    onChange={e => setNewFavInput(e.target.value.toUpperCase())}
                    placeholder="输入币种，如 SOLUSDT"
                    style={{ flex: 1, padding: '7px 10px', fontSize: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--t1)', outline: 'none' }}
                  />
                  <button onClick={() => {
                    const coin = newFavInput.trim();
                    if (!coin) return;
                    addFavCoin(user.uid, coin.includes('USDT') ? coin : coin + 'USDT');
                    setFavCoins(loadFavCoins(user.uid));
                    setNewFavInput('');
                    showToast('已添加收藏');
                  }} style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--primary)', color: '#000', fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer' }}>+ 添加</button>
                </div>

                {/* 价格预警 */}
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>价格预警</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 12 }}>对收藏币种设置价格预警，触发时邮件通知</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select style={{ width: 140, padding: '7px 10px', fontSize: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--t1)', outline: 'none' }}>
                      {favCoins.length > 0 ? favCoins.map(c => <option key={c}>{c}</option>) : <option>暂无收藏</option>}
                    </select>
                    <select style={{ width: 80, padding: '7px 10px', fontSize: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--t1)', outline: 'none' }}>
                      <option>高于</option><option>低于</option>
                    </select>
                    <input placeholder="目标价格" style={{ width: 110, padding: '7px 10px', fontSize: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--t1)', outline: 'none' }} />
                    <button onClick={() => showToast('价格预警已设置（功能开发中）')} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, border: '1px solid var(--primary)', background: 'transparent', color: 'var(--primary)', cursor: 'pointer' }}>设置</button>
                  </div>
                </div>
              </div>
            )}

            {/* ── 邀请返利 ── */}
            {activeTab === 'invite' && (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginTop: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>邀请好友 · 获得返利</div>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 16 }}>
                  每邀请1位好友注册并首次充值，你获得 <strong style={{ color: 'var(--primary)' }}>10次</strong> 免费查询；好友获得 <strong style={{ color: 'var(--primary)' }}>5次</strong> 新用户礼包
                </div>
                <div style={{ background: 'var(--bg3)', border: '1px dashed var(--border)', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>我的邀请码</div>
                    <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 3, color: 'var(--primary)' }}>{user.inviteCode}</div>
                  </div>
                  <button onClick={() => {
                    navigator.clipboard?.writeText(`https://wyckoff.pro/register?ref=${user.inviteCode}`);
                    showToast('邀请链接已复制到剪贴板');
                  }} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', cursor: 'pointer' }}>复制链接</button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--t2)', wordBreak: 'break-all', padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8, marginBottom: 16 }}>
                  https://wyckoff.pro/register?ref={user.inviteCode}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 14 }}>
                  {[
                    { n: inviteStats.totalInvited, l: '已邀请人数', c: 'var(--primary)' },
                    { n: inviteStats.totalPaid, l: '完成充值', c: 'var(--green)' },
                    { n: inviteStats.totalReward, l: '获得奖励次数', c: 'var(--primary)' },
                  ].map(s => (
                    <div key={s.l} style={{ background: 'var(--bg3)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: s.c }}>{s.n}</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>邀请记录</div>
                  {inviteStats.records.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--t4)', fontSize: 13 }}>暂无邀请记录，分享你的邀请链接吧</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead><tr>
                        {['用户','注册时间','是否充值','奖励次数'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {inviteStats.records.map((row, i) => (
                          <tr key={i}>
                            <td style={tdStyle}>{row.maskedEmail}</td>
                            <td style={tdStyle}>{row.registeredAt}</td>
                            <td style={tdStyle}><span style={{ color: row.hasPaid ? 'var(--green)' : 'var(--t3)' }}>{row.hasPaid ? '已充值' : '未充值'}</span></td>
                            <td style={{ ...tdStyle, color: row.hasPaid ? 'var(--primary)' : 'var(--t3)' }}>{row.hasPaid ? `+${row.rewardCredits}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* ── 充值记录 ── */}
            {activeTab === 'rechargeLog' && (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginTop: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>充值记录</div>
                {orders.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--t4)', fontSize: 13 }}>
                    暂无充值记录
                    <br />
                    <button onClick={() => navigate('recharge')} style={{ marginTop: 12, padding: '6px 16px', borderRadius: 8, background: '#f0b429', color: '#000', fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer' }}>去充值 →</button>
                  </div>
                ) : (
                  <>
                    {orders.map((r, i) => {
                      const st = orderStatusMap[r.status] ?? { text: r.status, color: 'var(--t3)' };
                      const expireDate = r.status === 'confirmed' && r.confirmedAt
                        ? (() => { const d = new Date(r.confirmedAt); d.setFullYear(d.getFullYear() + 1); return d.toLocaleDateString('zh-CN').replace(/\//g, '-'); })()
                        : null;
                      return (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < orders.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: r.status === 'confirmed' ? 'rgba(240,180,41,0.12)' : r.status === 'rejected' ? 'rgba(255,80,80,0.1)' : 'rgba(99,179,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                            {r.status === 'confirmed' ? '💰' : r.status === 'rejected' ? '✕' : '⏳'}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{r.planName}</div>
                            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                              {new Date(r.createdAt).toLocaleDateString('zh-CN')} · {st.text}
                              {r.walletNetwork ? ` · ${r.walletNetwork}` : ''}
                            </div>
                            {expireDate && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>到期日：<span style={{ color: 'var(--green)' }}>{expireDate}</span></div>}
                            {r.status === 'rejected' && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>已拒绝，未到账{r.adminNote ? `（${r.adminNote}）` : ''}</div>}
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: r.status === 'rejected' ? 'var(--red)' : 'var(--green)' }}>
                            ${r.amountUsd}
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ marginTop: 16, textAlign: 'center' }}>
                      <button onClick={() => navigate('recharge')} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', cursor: 'pointer' }}>去充值 →</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── 账户安全 ── */}
            {activeTab === 'security' && (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginTop: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>账户安全</div>
                {[
                  { icon: '🔑', title: '登录密码', desc: '建议使用8位以上，含字母、数字和特殊字符', status: '已设置', statusColor: 'var(--green)', action: '修改', comingSoon: false, onClick: () => { setPwError(''); setPwOld(''); setPwNew(''); setPwNew2(''); setShowPwModal(true); } },
                  { icon: '📧', title: '邮箱地址', desc: user.email, status: '已验证', statusColor: 'var(--green)', action: '修改', comingSoon: false, onClick: () => { setEmailError(''); setNewEmail(''); setEmailSent(false); setShowEmailModal(true); } },
                  { icon: '📱', title: '手机号绑定', desc: '即将上线，绑定手机号后可用于找回密码', status: '未绑定', statusColor: '#f0b429', action: '绑定', comingSoon: true, onClick: () => {} },
                  { icon: '🔒', title: '两步验证（2FA）', desc: '即将上线，开启后登录需额外验证，大幅提升账号安全', status: '未开启', statusColor: '#f0b429', action: '开启', comingSoon: true, onClick: () => {} },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>{item.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                        {item.title}
                        {item.comingSoon && <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', color: 'var(--t3)', border: '1px solid var(--border)', marginLeft: 6, verticalAlign: 'middle' }}>暂未开放</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{item.desc}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: item.statusColor }}>{item.status}</span>
                    <button onClick={item.comingSoon ? () => showToast(`${item.title}功能即将开放，敬请期待`) : item.onClick} disabled={item.comingSoon} style={{ marginLeft: 12, padding: '5px 12px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', cursor: item.comingSoon ? 'not-allowed' : 'pointer', opacity: item.comingSoon ? 0.4 : 1 }}>{item.action}</button>
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,80,80,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>⚠️</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)' }}>注销账号</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>永久删除账号及所有数据，不可恢复</div>
                  </div>
                  <button onClick={() => showToast('请联系客服申请注销')} style={{ marginLeft: 12, padding: '5px 12px', borderRadius: 6, fontSize: 12, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red)', cursor: 'pointer' }}>申请注销</button>
                </div>
              </div>
            )}

            {/* ── 反馈中心 ── */}
            {activeTab === 'feedback' && (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginTop: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>反馈中心</div>
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 10 }}>提交新反馈</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 6 }}>反馈类型</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                    {FEEDBACK_TYPES.map((t, i) => (
                      <button key={t} onClick={() => setFbType(i)} style={{
                        padding: '5px 14px', borderRadius: 20,
                        border: `1.5px solid ${fbType === i ? 'var(--primary)' : 'var(--border)'}`,
                        background: fbType === i ? 'var(--primary)' : 'transparent',
                        color: fbType === i ? '#000' : 'var(--t2)', fontSize: 12, cursor: 'pointer',
                        fontWeight: fbType === i ? 600 : 400,
                      }}>{t}</button>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 5 }}>详细描述 <span style={{ color: 'var(--red)' }}>*</span></div>
                  <textarea
                    value={fbText} onChange={e => setFbText(e.target.value)}
                    placeholder="请描述您遇到的问题或建议，越详细越好，方便我们快速定位..."
                    style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg3)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--t1)', fontSize: 13, padding: '10px 12px', resize: 'vertical', minHeight: 90, outline: 'none', fontFamily: 'inherit' }}
                    onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                  />
                  <button onClick={() => {
                    if (!fbText.trim()) { showToast('请填写反馈内容'); return; }
                    showToast('反馈已提交，我们会尽快处理并通过站内通知回复您 ✅');
                    setFbText('');
                  }} style={{ marginTop: 14, padding: '9px 28px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #f0b429, #e8920a)', color: '#000', fontWeight: 700, fontSize: 13 }}>提交反馈</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#f0b429', color: '#000', fontSize: 12, fontWeight: 600, padding: '8px 18px', borderRadius: 8, zIndex: 9999 }}>
          ✓ {toast}
        </div>
      )}

      {/* 修改密码弹窗 */}
      {showPwModal && (
        <div onClick={() => setShowPwModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1.5px solid var(--border)', borderRadius: 16, padding: '28px 28px', maxWidth: 380, width: '90%' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>🔑 修改登录密码</div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--t2)', display: 'block', marginBottom: 5 }}>新密码</label>
              <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)}
                placeholder="8位以上，含字母+数字+特殊字符"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--t1)', fontSize: 13, outline: 'none' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--t2)', display: 'block', marginBottom: 5 }}>确认新密码</label>
              <input type="password" value={pwNew2} onChange={e => setPwNew2(e.target.value)}
                placeholder="再次输入新密码"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--t1)', fontSize: 13, outline: 'none' }} />
            </div>
            {pwError && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>⚠ {pwError}</div>}
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 16 }}>提示：修改密码后需重新登录</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPwModal(false)} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', fontSize: 13, cursor: 'pointer' }}>取消</button>
              <button onClick={handleChangePassword} disabled={pwLoading} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#000', fontWeight: 700, fontSize: 13, cursor: pwLoading ? 'not-allowed' : 'pointer', opacity: pwLoading ? 0.7 : 1 }}>
                {pwLoading ? '修改中...' : '确认修改'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 修改邮箱弹窗 */}
      {showEmailModal && (
        <div onClick={() => setShowEmailModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1.5px solid var(--border)', borderRadius: 16, padding: '28px 28px', maxWidth: 380, width: '90%' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>📧 修改邮箱地址</div>
            {!emailSent ? (
              <>
                <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--t3)' }}>当前邮箱：<span style={{ color: 'var(--t1)' }}>{user.email}</span></div>
                <div style={{ marginBottom: 14, marginTop: 14 }}>
                  <label style={{ fontSize: 12, color: 'var(--t2)', display: 'block', marginBottom: 5 }}>新邮箱地址</label>
                  <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                    placeholder="输入新邮箱地址"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--t1)', fontSize: 13, outline: 'none' }} />
                </div>
                {emailError && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>⚠ {emailError}</div>}
                <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 16 }}>提交后，新邮箱会收到验证邮件，点击确认后生效</div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowEmailModal(false)} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', fontSize: 13, cursor: 'pointer' }}>取消</button>
                  <button onClick={handleChangeEmail} disabled={emailLoading} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#000', fontWeight: 700, fontSize: 13, cursor: emailLoading ? 'not-allowed' : 'pointer', opacity: emailLoading ? 0.7 : 1 }}>
                    {emailLoading ? '发送中...' : '发送验证邮件'}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
                <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>验证邮件已发送</p>
                <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 20 }}>请登录新邮箱 <strong style={{ color: 'var(--t1)' }}>{newEmail}</strong>，点击验证链接完成更改</p>
                <button onClick={() => setShowEmailModal(false)} style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>我知道了</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 退出确认 */}
      {showLogout && (
        <div onClick={() => setShowLogout(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1.5px solid var(--border)', borderRadius: 16, padding: '28px 24px', maxWidth: 320, width: '90%', textAlign: 'center' }}>
            <div style={{ fontSize: 28 }}>🚪</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>确认退出账号？</div>
            <p style={{ fontSize: 14, color: 'var(--t2)', margin: '10px 0 20px' }}>退出后需重新登录才能继续使用</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => { logout(); navigate('landing'); }} style={{ padding: '9px 24px', borderRadius: 8, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red)', fontSize: 13, cursor: 'pointer' }}>确认退出</button>
              <button onClick={() => setShowLogout(false)} style={{ padding: '9px 24px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', fontSize: 13, cursor: 'pointer' }}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
