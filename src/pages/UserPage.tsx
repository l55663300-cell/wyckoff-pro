import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import {
  loadQueries, calcAccuracy, labelQueryOutcome,
  loadFavCoins, saveFavCoins, addFavCoin, removeFavCoin,
  loadInviteStats, fetchFavCoins, fetchInviteStats,
} from '../utils/queryStore';
import { getUserSubOrders, getUserSubscription, type UserSubscription } from '../utils/subscriptionStore';
import type { QueryRecord, AccuracyStats, InviteStats } from '../utils/queryStore';
import type { SubscriptionOrder } from '../utils/subscriptionStore';
import { useT, getLang } from '../i18n';

type UserTab = 'history' | 'accuracy' | 'favorites' | 'invite' | 'rechargeLog' | 'security';

export default function UserPage() {
  const { user, logout, navigate, getQuota } = useApp();
  const t = useT();
  const [activeTab, setActiveTab] = useState<UserTab>('history');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.name ?? '');
  const [nameError, setNameError] = useState('');
  const [toast, setToast] = useState('');
  const [showLogout, setShowLogout] = useState(false);

  // 真实数据 state
  const [history, setHistory] = useState<QueryRecord[]>([]);
  const [accuracy, setAccuracy] = useState<AccuracyStats | null>(null);
  const [favCoins, setFavCoins] = useState<string[]>([]);
  const [inviteStats, setInviteStats] = useState<InviteStats>({ totalInvited: 0, totalPaid: 0, totalReward: 0, records: [] });
  const [orders, setOrders] = useState<SubscriptionOrder[]>([]);
  const [newFavInput, setNewFavInput] = useState('');

  const [sub, setSub] = useState<UserSubscription | null>(null);
  const [quota, setQuota] = useState<{ daily: number; total: number; expireAt: string | null; isActive: boolean }>({ daily: 0, total: 0, expireAt: null, isActive: false });
  const [isMobileView, setIsMobileView] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobileView(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

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
    if (!pwNew || pwNew.length < 8) { setPwError(t.user.pwShort); return; }
    if (pwNew !== pwNew2) { setPwError(t.user.pwMismatch); return; }
    if (!/(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d])/.test(pwNew)) {
      setPwError(t.user.pwWeak);
      return;
    }
    setPwLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwNew });
      if (error) throw error;
      showToast(t.user.pwSuccess);
      setShowPwModal(false);
      setPwOld(''); setPwNew(''); setPwNew2('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setPwError(msg || t.user.pwMismatch);
    } finally {
      setPwLoading(false);
    }
  };

  // 修改邮箱处理
  const handleChangeEmail = async () => {
    setEmailError('');
    if (!newEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      setEmailError(t.user.emailInvalid);
      return;
    }
    setEmailLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) throw error;
      setEmailSent(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setEmailError(msg || t.user.emailInvalid);
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
    const [favData, inviteData, subData, ordersData, quotaData] = await Promise.all([
      fetchFavCoins(uid),
      fetchInviteStats(uid),
      getUserSubscription(uid),
      getUserSubOrders(uid),
      getQuota(),
    ]);
    setFavCoins(favData);
    setInviteStats(inviteData);
    setSub(subData);
    setOrders(ordersData);
    setQuota(quotaData);
  }, [user, getQuota]);

  useEffect(() => { reloadData(); }, [reloadData]);

  if (!user) { navigate('login'); return null; }

  const avatar = user.name?.[0]?.toUpperCase() ?? 'U';
  const locale = getLang() === 'en' ? 'en-US' : 'zh-CN';

  const tdStyle: React.CSSProperties = {
    padding: '12px 14px', borderBottom: '1px solid rgba(30,45,66,0.4)',
    color: 'var(--t2)', fontSize: 13,
  };
  const thStyle: React.CSSProperties = {
    padding: '10px 14px', textAlign: 'left', fontSize: 11,
    color: 'var(--t3)', borderBottom: '1px solid var(--border)', fontWeight: 600,
  };

  const tabDefs: { key: UserTab; label: string }[] = [
    { key: 'history',     label: t.user.tabHistory },
    { key: 'accuracy',    label: t.user.tabAccuracy },
    { key: 'favorites',   label: t.user.tabFavorites },
    { key: 'invite',      label: t.user.tabInvite },
    { key: 'rechargeLog', label: t.user.tabRechargeLog },
    { key: 'security',    label: t.user.tabSecurity },
  ];

  // 会员状态
  const proExpireDate = sub?.expireAt ? new Date(sub.expireAt).toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-') : null;
  const todayUsed = sub ? (sub.lastUsedDate === new Date().toISOString().slice(0, 10) ? sub.dailyUsed : 0) : 0;
  const dailyLimit = sub?.dailyLimit ?? 0;
  const progressPct = dailyLimit > 0 ? Math.min(100, Math.round((todayUsed / dailyLimit) * 100)) : 0;

  // 充值记录状态映射
  const orderStatusMap: Record<string, { text: string; color: string }> = {
    pending:   { text: t.user.orderPending,   color: '#f0b429' },
    confirmed: { text: t.user.orderConfirmed, color: 'var(--green)' },
    rejected:  { text: t.user.orderRejected,  color: 'var(--red)' },
  };

  // 账户安全条目
  const securityItems = [
    { icon: '🔑', title: t.user.secPassword, desc: t.user.secPasswordDesc, status: t.user.secPasswordSet, statusColor: 'var(--green)', action: t.user.secModify, comingSoon: false, onClick: () => { setPwError(''); setPwOld(''); setPwNew(''); setPwNew2(''); setShowPwModal(true); } },
    { icon: '📧', title: t.user.secEmail,    desc: user.email,              status: t.user.secEmailVerified, statusColor: 'var(--green)', action: t.user.secModify, comingSoon: false, onClick: () => { setEmailError(''); setNewEmail(''); setEmailSent(false); setShowEmailModal(true); } },
    { icon: '📱', title: t.user.secPhone,    desc: t.user.secPhoneDesc,    status: t.user.secPhoneStatus, statusColor: '#f0b429', action: t.user.secBind,   comingSoon: true,  onClick: () => {} },
    { icon: '🔒', title: t.user.sec2FA,      desc: t.user.sec2FADesc,      status: t.user.sec2FAStatus,   statusColor: '#f0b429', action: t.user.secEnable, comingSoon: true,  onClick: () => {} },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg1)', color: 'var(--t1)' }}>
      {/* 顶部导航 */}
      <nav style={{
        position: 'sticky', top: 0, background: 'rgba(6,13,24,0.98)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 32px', height: 60, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 16 }}>
          <span style={{ fontSize: 22 }}>🦞</span> {t.user.navTitle}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => navigate('app')} style={{ padding: '7px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)' }}>{t.user.backToApp}</button>
          <button onClick={() => setShowLogout(true)} style={{ padding: '7px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)' }}>{t.user.logout}</button>
        </div>
      </nav>

      <div style={{ padding: '24px 16px', maxWidth: 900, margin: '0 auto' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>{t.user.pageTitle}</h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobileView ? '1fr' : '1fr 2fr',
          gap: 16,
        }}>

          {/* 左侧/顶部账户卡片 */}
          <div>
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: isMobileView ? '16px' : '24px' }}>
              {/* 头像+名字横排 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{
                  width: isMobileView ? 48 : 64, height: isMobileView ? 48 : 64, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #f0b429, #e8920a)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: isMobileView ? 20 : 26, fontWeight: 700, color: '#000',
                }}>{avatar}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 2 }}>
                    {editingName ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          value={nameInput}
                          onChange={e => { setNameInput(e.target.value); setNameError(''); }}
                          maxLength={16}
                          style={{ background: 'var(--bg3)', border: '1.5px solid var(--primary)', color: 'var(--t1)', fontSize: 13, fontWeight: 600, borderRadius: 5, padding: '2px 8px', outline: 'none', width: 110 }}
                        />
                        <button onClick={() => {
                          if (nameInput.trim().length < 2) { setNameError(t.user.nicknameTooShort); return; }
                          setEditingName(false); showToast(t.user.savedNickname);
                        }} style={{ background: 'var(--primary)', border: 'none', color: '#000', borderRadius: 5, padding: '3px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{t.user.nicknameEdit}</button>
                      </div>
                    ) : (
                      <>
                        <span style={{ fontSize: 16, fontWeight: 700 }}>{nameInput || user.name}</span>
                        {quota.isActive && (
                          <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'linear-gradient(90deg,#f0b429,#e8920a)', color: '#000' }}>
                            {t.user.memberBadge(sub?.planName ?? 'Pro')}
                          </span>
                        )}
                        <button onClick={() => setEditingName(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--t3)', padding: '0 2px' }}>✏️</button>
                      </>
                    )}
                  </div>
                  {nameError && <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 4 }}>{nameError}</div>}
                  <div style={{ fontSize: 12, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>UID #{user.uid}</div>
                </div>
              </div>

              {/* 会员状态 */}
              {quota.isActive && sub ? (
                <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--t2)', marginBottom: 6 }}>
                    <span style={{ fontWeight: 600 }}>{sub.planName}</span>
                    <span style={{ color: 'var(--primary)' }}>{t.user.expireAt}：{proExpireDate}</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                    <div style={{ width: `${progressPct}%`, height: '100%', background: 'linear-gradient(90deg, #f0b429, #e8920a)', borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                    {t.user.todayUsed(todayUsed, dailyLimit)}
                  </div>
                </div>
              ) : (
                <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '12px 14px', marginBottom: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 6 }}>{t.user.noSubscription}</div>
                  <button onClick={() => navigate('recharge')} style={{ padding: '4px 14px', borderRadius: 8, background: '#f0b429', color: '#000', fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer' }}>{t.user.subscribeNow}</button>
                </div>
              )}

              {/* 快捷按钮 */}
              <div style={{ display: 'flex', gap: 8 }}>
                {(['history', 'security'] as UserTab[]).map((tab, i) => (
                  <button key={tab} onClick={() => setActiveTab(tab)} style={{
                    flex: 1, padding: '5px 8px', borderRadius: 6, fontSize: 12,
                    border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', cursor: 'pointer',
                  }}>{i === 0 ? t.user.quickHistory : t.user.quickSecurity}</button>
                ))}
              </div>
            </div>
          </div>

          {/* 右侧Tab内容 */}
          <div>
            {/* Tab导航 */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 0, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
              {tabDefs.map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                  padding: '8px 14px', fontSize: 13, fontWeight: 600,
                  color: activeTab === tab.key ? 'var(--primary)' : 'var(--t3)',
                  background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  borderBottom: `2px solid ${activeTab === tab.key ? 'var(--primary)' : 'transparent'}`,
                  marginBottom: -1, transition: 'all .15s',
                }}>{tab.label}</button>
              ))}
            </div>

            {/* ── 查询历史 ── */}
            {activeTab === 'history' && (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{t.user.historyTitle}</span>
                  <span style={{ fontSize: 12, color: 'var(--t3)' }}>{t.user.historyHint}</span>
                </div>
                {history.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--t4)', fontSize: 13 }}>
                    {t.user.historyEmpty}<button onClick={() => navigate('app')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, padding: '0 2px' }}>{t.user.historyEmptyLink}</button>{t.user.historyEmptyEnd}
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      {[t.user.thSymbol, t.user.thDirection, t.user.thScore, t.user.thPhase, t.user.thTime, t.user.thResult].map(h => <th key={h} style={thStyle}>{h}</th>)}
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
                            {new Date(row.createdAt).toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={tdStyle}>
                            {row.outcome ? (
                              <span style={{ color: row.outcome === 'win' ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                                {row.outcome === 'win' ? t.user.win : t.user.loss}
                              </span>
                            ) : (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => { labelQueryOutcome(user.uid, row.id, 'win'); reloadData(); showToast(t.user.toastMarkWin); }} style={{ padding: '2px 7px', fontSize: 11, border: '1px solid var(--green)', background: 'transparent', color: 'var(--green)', borderRadius: 4, cursor: 'pointer' }}>{t.user.markWin}</button>
                                <button onClick={() => { labelQueryOutcome(user.uid, row.id, 'loss'); reloadData(); showToast(t.user.toastMarkLoss); }} style={{ padding: '2px 7px', fontSize: 11, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red)', borderRadius: 4, cursor: 'pointer' }}>{t.user.markLoss}</button>
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
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{t.user.accuracyTitle}</div>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 20 }}>{t.user.accuracyHint}</div>
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
                      <div style={{ fontSize: 11, color: 'var(--t3)', textAlign: 'center', marginTop: 6 }}>{t.user.accuracyOverall}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      {[
                        { label: t.user.longAcc,   val: accuracy.longTotal > 0  ? `${Math.round((accuracy.longWin / accuracy.longTotal) * 100)}%`   : '—', sub: accuracy.longTotal > 0  ? `(${accuracy.longWin}/${accuracy.longTotal})`   : '', color: 'var(--green)' },
                        { label: t.user.shortAcc,  val: accuracy.shortTotal > 0 ? `${Math.round((accuracy.shortWin / accuracy.shortTotal) * 100)}%` : '—', sub: accuracy.shortTotal > 0 ? `(${accuracy.shortWin}/${accuracy.shortTotal})` : '', color: 'var(--red)' },
                        { label: t.user.labeled,   val: `${accuracy.labeled} ${getLang() === 'en' ? 'times' : '次'}`,   sub: '', color: 'var(--t1)' },
                        { label: t.user.unlabeled(accuracy.unlabeled), val: '', sub: '', color: 'var(--t3)' },
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
                    {t.user.accuracyEmpty}
                  </div>
                )}
                <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 14, fontSize: 12, color: 'var(--t2)', lineHeight: 1.7 }}>
                  💡 <strong style={{ color: 'var(--t1)' }}>{t.user.accTips}</strong><br />
                  {t.user.accTipsDesc}
                </div>
                <div style={{ marginTop: 16 }}>
                  <button onClick={() => setActiveTab('history')} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', cursor: 'pointer' }}>{t.user.goMarkHistory}</button>
                </div>
              </div>
            )}

            {/* ── 收藏币种 ── */}
            {activeTab === 'favorites' && (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{t.user.favoritesTitle}</span>
                  <span style={{ fontSize: 12, color: 'var(--t3)' }}>{t.user.favoritesHint}</span>
                </div>
                {favCoins.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t4)', fontSize: 13 }}>
                    {t.user.favoritesEmpty}
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
                          showToast(t.user.toastFavRemoved);
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
                    placeholder={t.user.favInputPlaceholder}
                    style={{ flex: 1, padding: '7px 10px', fontSize: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--t1)', outline: 'none' }}
                  />
                  <button onClick={() => {
                    const coin = newFavInput.trim();
                    if (!coin) return;
                    addFavCoin(user.uid, coin.includes('USDT') ? coin : coin + 'USDT');
                    setFavCoins(loadFavCoins(user.uid));
                    setNewFavInput('');
                    showToast(t.user.toastFavAdded);
                  }} style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--primary)', color: '#000', fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer' }}>{t.user.favAddBtn}</button>
                </div>

                {/* 价格预警 */}
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{t.user.priceAlertTitle}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 12 }}>{t.user.priceAlertHint}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select style={{ width: 140, padding: '7px 10px', fontSize: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--t1)', outline: 'none' }}>
                      {favCoins.length > 0 ? favCoins.map(c => <option key={c}>{c}</option>) : <option>{t.user.noFavCoins}</option>}
                    </select>
                    <select style={{ width: 80, padding: '7px 10px', fontSize: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--t1)', outline: 'none' }}>
                      <option>{t.user.alertAbove}</option><option>{t.user.alertBelow}</option>
                    </select>
                    <input placeholder={t.user.alertTargetPlaceholder} style={{ width: 110, padding: '7px 10px', fontSize: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--t1)', outline: 'none' }} />
                    <button onClick={() => showToast(t.user.toastAlertSet)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, border: '1px solid var(--primary)', background: 'transparent', color: 'var(--primary)', cursor: 'pointer' }}>{t.user.alertSetBtn}</button>
                  </div>
                </div>
              </div>
            )}

            {/* ── 邀请返利 ── */}
            {activeTab === 'invite' && (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginTop: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{t.user.inviteTitle}</div>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 16 }}>
                  {t.user.inviteDesc(10, 5)}
                </div>
                <div style={{ background: 'var(--bg3)', border: '1px dashed var(--border)', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>{t.user.myInviteCode}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 3, color: 'var(--primary)' }}>{user.inviteCode}</div>
                  </div>
                  <button onClick={() => {
                    navigator.clipboard?.writeText(`https://wyckoff.pro/register?ref=${user.inviteCode}`);
                    showToast(t.user.toastLinkCopied);
                  }} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', cursor: 'pointer' }}>{t.user.copyLinkBtn}</button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--t2)', wordBreak: 'break-all', padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8, marginBottom: 16 }}>
                  https://wyckoff.pro/register?ref={user.inviteCode}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 14 }}>
                  {[
                    { n: inviteStats.totalInvited, l: t.user.invitedCount, c: 'var(--primary)' },
                    { n: inviteStats.totalPaid,    l: t.user.paidCount,    c: 'var(--green)' },
                    { n: inviteStats.totalReward,  l: t.user.rewardCount,  c: 'var(--primary)' },
                  ].map(s => (
                    <div key={s.l} style={{ background: 'var(--bg3)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: s.c }}>{s.n}</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{t.user.inviteRecords}</div>
                  {inviteStats.records.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--t4)', fontSize: 13 }}>{t.user.inviteRecordsEmpty}</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead><tr>
                        {[t.user.thUser, t.user.thRegTime, t.user.thPaid, t.user.thReward].map(h => <th key={h} style={thStyle}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {inviteStats.records.map((row, i) => (
                          <tr key={i}>
                            <td style={tdStyle}>{row.maskedEmail}</td>
                            <td style={tdStyle}>{row.registeredAt}</td>
                            <td style={tdStyle}><span style={{ color: row.hasPaid ? 'var(--green)' : 'var(--t3)' }}>{row.hasPaid ? t.user.hasPaid : t.user.notPaid}</span></td>
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
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{t.user.rechargeLogTitle}</div>
                {orders.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--t4)', fontSize: 13 }}>
                    {t.user.rechargeLogEmpty}
                    <br />
                    <button onClick={() => navigate('recharge')} style={{ marginTop: 12, padding: '6px 16px', borderRadius: 8, background: '#f0b429', color: '#000', fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer' }}>{t.user.goRecharge}</button>
                  </div>
                ) : (
                  <>
                    {orders.map((r, i) => {
                      const st = orderStatusMap[r.status] ?? { text: r.status, color: 'var(--t3)' };
                      const expireDate = r.status === 'confirmed' && r.confirmedAt
                        ? (() => { const d = new Date(r.confirmedAt); d.setFullYear(d.getFullYear() + 1); return d.toLocaleDateString(locale).replace(/\//g, '-'); })()
                        : null;
                      return (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < orders.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: r.status === 'confirmed' ? 'rgba(240,180,41,0.12)' : r.status === 'rejected' ? 'rgba(255,80,80,0.1)' : 'rgba(99,179,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                            {r.status === 'confirmed' ? '💰' : r.status === 'rejected' ? '✕' : '⏳'}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{r.planName}</div>
                            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                              {new Date(r.createdAt).toLocaleDateString(locale)} · {st.text}
                              {r.walletNetwork ? ` · ${r.walletNetwork}` : ''}
                            </div>
                            {expireDate && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{t.user.orderExpire}<span style={{ color: 'var(--green)' }}>{expireDate}</span></div>}
                            {r.status === 'rejected' && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>{t.user.orderRejectedNote(r.adminNote ?? '')}</div>}
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: r.status === 'rejected' ? 'var(--red)' : 'var(--green)' }}>
                            ${r.amountUsd}
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ marginTop: 16, textAlign: 'center' }}>
                      <button onClick={() => navigate('recharge')} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', cursor: 'pointer' }}>{t.user.goRecharge}</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── 账户安全 ── */}
            {activeTab === 'security' && (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginTop: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{t.user.securityTitle}</div>
                {securityItems.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>{item.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                        {item.title}
                        {item.comingSoon && <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', color: 'var(--t3)', border: '1px solid var(--border)', marginLeft: 6, verticalAlign: 'middle' }}>{t.user.secComingSoon}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{item.desc}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: item.statusColor }}>{item.status}</span>
                    <button onClick={item.comingSoon ? () => showToast(t.user.secComingSoonToast(item.title)) : item.onClick} disabled={item.comingSoon} style={{ marginLeft: 12, padding: '5px 12px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', cursor: item.comingSoon ? 'not-allowed' : 'pointer', opacity: item.comingSoon ? 0.4 : 1 }}>{item.action}</button>
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,80,80,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>⚠️</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)' }}>{t.user.deleteAccount}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{t.user.deleteAccountDesc}</div>
                  </div>
                  <button onClick={() => showToast(t.user.toastContactSupport)} style={{ marginLeft: 12, padding: '5px 12px', borderRadius: 6, fontSize: 12, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red)', cursor: 'pointer' }}>{t.user.deleteAccountBtn}</button>
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
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>{t.user.pwModalTitle}</div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--t2)', display: 'block', marginBottom: 5 }}>{t.user.pwNewLabel}</label>
              <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)}
                placeholder={t.user.pwNewPlaceholder}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--t1)', fontSize: 13, outline: 'none' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--t2)', display: 'block', marginBottom: 5 }}>{t.user.pwConfirmLabel}</label>
              <input type="password" value={pwNew2} onChange={e => setPwNew2(e.target.value)}
                placeholder={t.user.pwConfirmPlaceholder}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--t1)', fontSize: 13, outline: 'none' }} />
            </div>
            {pwError && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>⚠ {pwError}</div>}
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 16 }}>{t.user.pwHint}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPwModal(false)} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', fontSize: 13, cursor: 'pointer' }}>{t.user.pwCancelBtn}</button>
              <button onClick={handleChangePassword} disabled={pwLoading} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#000', fontWeight: 700, fontSize: 13, cursor: pwLoading ? 'not-allowed' : 'pointer', opacity: pwLoading ? 0.7 : 1 }}>
                {pwLoading ? t.user.pwConfirmingBtn : t.user.pwConfirmBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 修改邮箱弹窗 */}
      {showEmailModal && (
        <div onClick={() => setShowEmailModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2)', border: '1.5px solid var(--border)', borderRadius: 16, padding: '28px 28px', maxWidth: 380, width: '90%' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>{t.user.emailModalTitle}</div>
            {!emailSent ? (
              <>
                <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--t3)' }}>{t.user.currentEmail}<span style={{ color: 'var(--t1)' }}>{user.email}</span></div>
                <div style={{ marginBottom: 14, marginTop: 14 }}>
                  <label style={{ fontSize: 12, color: 'var(--t2)', display: 'block', marginBottom: 5 }}>{t.user.newEmailLabel}</label>
                  <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                    placeholder={t.user.newEmailPlaceholder}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--t1)', fontSize: 13, outline: 'none' }} />
                </div>
                {emailError && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>⚠ {emailError}</div>}
                <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 16 }}>{t.user.emailHint}</div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowEmailModal(false)} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', fontSize: 13, cursor: 'pointer' }}>{t.user.emailCancelBtn}</button>
                  <button onClick={handleChangeEmail} disabled={emailLoading} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#000', fontWeight: 700, fontSize: 13, cursor: emailLoading ? 'not-allowed' : 'pointer', opacity: emailLoading ? 0.7 : 1 }}>
                    {emailLoading ? t.user.emailSendingBtn : t.user.emailSendBtn}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
                <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t.user.emailSentTitle}</p>
                <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 20 }}>{t.user.emailSentDesc(newEmail)}</p>
                <button onClick={() => setShowEmailModal(false)} style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{t.user.emailSentOk}</button>
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
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>{t.user.logoutConfirmTitle}</div>
            <p style={{ fontSize: 14, color: 'var(--t2)', margin: '10px 0 20px' }}>{t.user.logoutConfirmDesc}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => { logout(); navigate('landing'); }} style={{ padding: '9px 24px', borderRadius: 8, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red)', fontSize: 13, cursor: 'pointer' }}>{t.user.logoutConfirmBtn}</button>
              <button onClick={() => setShowLogout(false)} style={{ padding: '9px 24px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', fontSize: 13, cursor: 'pointer' }}>{t.user.logoutCancelBtn}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
