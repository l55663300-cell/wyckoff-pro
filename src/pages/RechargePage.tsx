import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  getActivePlans, getActiveWallets, submitSubOrder, getUserSubOrders, getUserSubscription,
  CYCLE_LABEL, ORDER_STATUS_LABEL,
  type SubscriptionPlan, type PaymentWallet, type SubscriptionOrder, type UserSubscription,
} from '../utils/subscriptionStore';
import { loadSysConfig } from '../utils/sysConfigStore';

type Step = 'pick' | 'pay' | 'done';

// NowPayments 自动支付状态
interface AutoPayState {
  paymentId: number | null;
  payAddress: string;
  payAmount: number;
  payCurrency: string;
  status: 'idle' | 'creating' | 'waiting' | 'finished' | 'error';
  errorMsg: string;
}

const INITIAL_AUTO_PAY: AutoPayState = {
  paymentId: null,
  payAddress: '',
  payAmount: 0,
  payCurrency: '',
  status: 'idle',
  errorMsg: '',
};

export default function RechargePage() {
  const { navigate, user, getQuota } = useApp();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [wallets, setWallets] = useState<PaymentWallet[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<PaymentWallet | null>(null);
  const [step, setStep] = useState<Step>('pick');
  const [txHash, setTxHash] = useState('');
  const [proofNote, setProofNote] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [toast, setToast] = useState('');
  const [myOrders, setMyOrders] = useState<SubscriptionOrder[]>([]);
  const [showOrders, setShowOrders] = useState(false);
  const [currentSub, setCurrentSub] = useState<UserSubscription | null>(null);
  const [quota, setQuota] = useState<{ daily: number; total: number; expireAt: string | null; isActive: boolean }>({ daily: 0, total: 0, expireAt: null, isActive: false });

  // 自动支付（NowPayments）
  const [autoPay, setAutoPay] = useState<AutoPayState>(INITIAL_AUTO_PAY);
  const [autoPayMode, setAutoPayMode] = useState(false);   // true=自动支付模式; false=手动模式
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentOrderId = useRef<string>('');

  // 清理轮询
  const clearPoll = () => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
  };

  // 轮询查询订单状态
  const startPolling = (orderId: string) => {
    clearPoll();
    pollTimer.current = setInterval(async () => {
      try {
        const { data } = await import('../lib/supabase').then(m => m.supabase
          .from('subscription_orders')
          .select('status')
          .eq('id', orderId)
          .single()
        );
        if (data?.status === 'confirmed') {
          clearPoll();
          setAutoPay(p => ({ ...p, status: 'finished' }));
          setStep('done');
          void refreshData();
        }
      } catch { /* 忽略轮询网络错误 */ }
    }, 8000);  // 每 8 秒查一次
  };

  // 创建自动支付订单
  const handleCreateAutoPay = async () => {
    if (!user || !selectedPlan) return;
    setAutoPay({ ...INITIAL_AUTO_PAY, status: 'creating' });

    const orderId = `SO${Date.now()}`;
    currentOrderId.current = orderId;

    try {
      // 1. 调用 Worker 创建 NowPayments 支付
      const resp = await fetch('/api/nowpayments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price_amount: selectedPlan.priceUsd,
          order_id: orderId,
          order_description: `${selectedPlan.name} 订阅 — ${user.email}`,
          payer_email: user.email,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: '网络错误' })) as { error?: string };
        throw new Error(err.error ?? `HTTP ${resp.status}`);
      }

      const payment = await resp.json() as {
        payment_id: number;
        pay_address: string;
        pay_amount: number;
        pay_currency: string;
      };

      // 2. 写订单到 Supabase（status=pending，webhook 收到后自动改 confirmed）
      // 用一个虚拟 wallet 对象兼容 submitSubOrder 接口
      const virtualWallet: PaymentWallet = {
        id: 'nowpayments_auto',
        label: 'TRC20 USDT（自动）',
        address: payment.pay_address,
        network: 'TRC20',
        isActive: true,
        sortOrder: 0,
        updatedAt: new Date().toISOString(),
      };
      await submitSubOrder(
        { uid: user.uid, email: user.email },
        selectedPlan,
        virtualWallet,
        String(payment.payment_id),
        `NowPayments 自动支付，payment_id=${payment.payment_id}`,
      );

      setAutoPay({
        paymentId: payment.payment_id,
        payAddress: payment.pay_address,
        payAmount: payment.pay_amount,
        payCurrency: payment.pay_currency,
        status: 'waiting',
        errorMsg: '',
      });

      // 3. 开始轮询
      startPolling(orderId);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAutoPay({ ...INITIAL_AUTO_PAY, status: 'error', errorMsg: msg });
    }
  };

  // 离开时清理
  useEffect(() => () => clearPoll(), []);

  // 刷新套餐和钱包（每次回到 pick 步骤都重新加载，确保后台修改后立即生效）
  const refreshData = useCallback(async () => {
    const [p, w, q] = await Promise.all([
      getActivePlans(),
      getActiveWallets(),
      getQuota(),
    ]);
    setPlans(p);
    setWallets(w);
    setQuota(q);
    if (user) {
      const [orders, sub] = await Promise.all([getUserSubOrders(user.uid), getUserSubscription(user.uid)]);
      setMyOrders(orders);
      setCurrentSub(sub);
    }
  }, [user, getQuota]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  // 每次回到 pick 步骤时重新加载（防止后台改钱包/套餐后缓存旧数据）
  useEffect(() => {
    if (step === 'pick') void refreshData();
  }, [step, refreshData]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const handlePickPlan = async (plan: SubscriptionPlan) => {
    const freshWallets = await getActiveWallets();
    setWallets(freshWallets);
    setSelectedPlan(plan);
    setSelectedWallet(freshWallets[0] ?? null);
    setTxHash('');
    setProofNote('');
    setAgreed(false);
    setAutoPay(INITIAL_AUTO_PAY);
    setAutoPayMode(false);  // 默认手动支付（自动支付 KYC 通过后再切换）
    clearPoll();
    setStep('pay');
  };

  const handleSubmit = async () => {
    if (!agreed) { showToast('请先勾选确认付款说明'); return; }
    if (!txHash.trim()) { showToast('请填写链上 TxHash（交易哈希），方便管理员核对'); return; }
    if (!user) { navigate('login'); return; }
    if (!selectedPlan || !selectedWallet) return;
    await submitSubOrder({ uid: user.uid, email: user.email }, selectedPlan, selectedWallet, txHash.trim(), proofNote.trim() || undefined);
    const orders = await getUserSubOrders(user.uid);
    setMyOrders(orders);
    setStep('done');
  };

  const handleBack = () => { clearPoll(); setAutoPay(INITIAL_AUTO_PAY); setStep('pick'); setSelectedPlan(null); };

  if (!user) { navigate('login'); return null; }

  const fmtExpire = (iso: string) => { try { return new Date(iso).toLocaleDateString('zh-CN'); } catch { return iso; } };
  const fmtTime = (iso: string) => { try { return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };
  const statusColor: Record<string, string> = { pending: 'var(--primary)', confirmed: 'var(--green)', rejected: 'var(--red)' };

  // 当前订阅信息
  const isSubActive = currentSub && new Date(currentSub.expireAt) > new Date();
  const sysConfig = loadSysConfig();

  // 判断每个套餐的状态
  const getPlanStatus = (plan: SubscriptionPlan): 'current' | 'upgrade' | 'downgrade' | 'renew' | 'new' => {
    if (!currentSub) return 'new';
    if (!isSubActive) return 'renew';
    if (plan.id === currentSub.planId) return 'current';
    if (plan.dailyLimit > currentSub.dailyLimit) return 'upgrade';
    return 'downgrade';
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg1)' }}>
      {/* 顶部导航 */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(6,13,24,0.98)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', height: 60,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 16 }}>
          <span style={{ fontSize: 22 }}>🦞</span>
          <span>AI威科夫Pro</span>
          <span style={{ margin: '0 4px', color: 'var(--t3)' }}>/</span>
          <span style={{ fontSize: 14, color: 'var(--t2)', fontWeight: 400 }}>订阅中心</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* 当前订阅状态标签 */}
          {isSubActive && (
            <div style={{
              padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'rgba(0,200,150,0.1)', color: 'var(--green)',
              border: '1px solid rgba(0,200,150,0.25)',
            }}>
              {currentSub!.planName} · 剩余 {quota.daily}/{quota.total} 次/天
            </div>
          )}
          <button onClick={() => setShowOrders(v => !v)} style={{
            padding: '7px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
            background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)',
          }}>我的订单</button>
          <button onClick={() => navigate('app')} style={{
            padding: '7px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
            background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)',
          }}>返回分析</button>
        </div>
      </nav>

      <div style={{ padding: '40px 20px', maxWidth: 900, margin: '0 auto' }}>

        {/* ── 当前订阅 Banner（已订阅时展示） ── */}
        {step === 'pick' && isSubActive && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(0,200,150,0.08), rgba(0,150,100,0.05))',
            border: '1px solid rgba(0,200,150,0.25)', borderRadius: 16,
            padding: '18px 24px', marginBottom: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 4 }}>当前订阅</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t1)' }}>
                {currentSub!.planName}
                <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 400, color: 'var(--green)' }}>● 有效</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 3 }}>
                到期时间：{fmtExpire(currentSub!.expireAt)} · 今日已用 {currentSub!.dailyLimit - quota.daily}/{currentSub!.dailyLimit} 次
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowOrders(true)} style={{
                padding: '7px 16px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)',
              }}>查看订单</button>
            </div>
          </div>
        )}

        {/* ── 步骤1：选择套餐 ── */}
        {step === 'pick' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>
                {isSubActive ? '升级 / 续费套餐' : '选择订阅套餐'}
              </h2>
              <p style={{ color: 'var(--t2)', fontSize: 14 }}>
                所有套餐使用 USDT 支付，{sysConfig.reviewTimeNote}
              </p>
            </div>

            {plans.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--t3)', fontSize: 14 }}>
                暂无可用套餐，请联系管理员<br />
                <span style={{ fontSize: 12, marginTop: 8, display: 'inline-block' }}>
                  📧 {sysConfig.supportEmail}
                </span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
                {plans.map(plan => {
                  const planStatus = getPlanStatus(plan);
                  const isCurrent = planStatus === 'current';
                  const isUpgrade = planStatus === 'upgrade';

                  const borderColor = isCurrent
                    ? 'var(--green)'
                    : isUpgrade
                    ? 'var(--primary)'
                    : plan.popular
                    ? 'var(--primary)'
                    : 'var(--border)';

                  const btnBg = isCurrent
                    ? 'rgba(0,200,150,0.15)'
                    : isUpgrade || plan.popular
                    ? 'linear-gradient(135deg, #f0b429, #e8920a)'
                    : 'var(--bg3)';
                  const btnColor = isCurrent ? 'var(--green)' : isUpgrade || plan.popular ? '#000' : 'var(--t1)';
                  const btnText = isCurrent
                    ? '当前套餐（可续费）'
                    : isUpgrade
                    ? '升级至此套餐 ↑'
                    : planStatus === 'renew'
                    ? '立即续费 →'
                    : planStatus === 'downgrade'
                    ? '换用此套餐'
                    : '选择此套餐 →';

                  return (
                    <div key={plan.id} style={{
                      background: 'var(--bg2)', border: `2px solid ${borderColor}`,
                      borderRadius: 18, padding: '28px 22px', cursor: 'pointer',
                      transition: 'all .2s', position: 'relative',
                    }}
                      onClick={() => handlePickPlan(plan)}
                      onMouseEnter={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; }}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = borderColor}
                    >
                      {/* 标签（最受欢迎 / 当前套餐 / 推荐升级） */}
                      {isCurrent && (
                        <div style={{
                          position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                          background: 'var(--green)', color: '#000', fontSize: 10, fontWeight: 800,
                          padding: '3px 16px', borderRadius: 20, whiteSpace: 'nowrap',
                        }}>当前套餐</div>
                      )}
                      {!isCurrent && isUpgrade && (
                        <div style={{
                          position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                          background: 'var(--primary)', color: '#000', fontSize: 10, fontWeight: 800,
                          padding: '3px 16px', borderRadius: 20, whiteSpace: 'nowrap',
                        }}>推荐升级</div>
                      )}
                      {!isCurrent && !isUpgrade && plan.popular && (
                        <div style={{
                          position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                          background: 'var(--primary)', color: '#000', fontSize: 10, fontWeight: 800,
                          padding: '3px 16px', borderRadius: 20, whiteSpace: 'nowrap',
                        }}>最受欢迎</div>
                      )}

                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)', marginBottom: 2 }}>{plan.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 16 }}>{CYCLE_LABEL[plan.cycle]}订阅 · {plan.durationDays} 天</div>
                      <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--primary)', lineHeight: 1 }}>
                        ${plan.priceUsd}
                        <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--t3)', marginLeft: 4 }}>/ {CYCLE_LABEL[plan.cycle]}</span>
                      </div>
                      <div style={{ margin: '16px 0', height: 1, background: 'var(--border)' }} />
                      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', fontSize: 12, color: 'var(--t2)', lineHeight: 2 }}>
                        <li><span style={{ color: 'var(--primary)', marginRight: 6 }}>⚡</span>每日 <strong style={{ color: 'var(--t1)' }}>{plan.dailyLimit}</strong> 次 AI 分析</li>
                        <li><span style={{ color: 'var(--t3)', marginRight: 6 }}>🕐</span>每小时限 {plan.hourlyLimit} 次</li>
                        {plan.perks.map(perk => (
                          <li key={perk}><span style={{ color: 'var(--green)', marginRight: 6 }}>✓</span>{perk}</li>
                        ))}
                      </ul>
                      <button style={{
                        width: '100%', padding: '10px 0', borderRadius: 10, fontWeight: 700, fontSize: 14,
                        background: btnBg, color: btnColor,
                        border: isCurrent ? '1px solid var(--green)' : isUpgrade || plan.popular ? 'none' : '1px solid var(--border)',
                        cursor: 'pointer',
                      }}>{btnText}</button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 联系客服 */}
            <div style={{ marginTop: 36, textAlign: 'center', fontSize: 13, color: 'var(--t3)' }}>
              有疑问？联系客服：
              <a href={`mailto:${sysConfig.supportEmail}`} style={{ color: 'var(--primary)', marginLeft: 6 }}>{sysConfig.supportEmail}</a>
              {sysConfig.supportWeChat && (
                <span style={{ marginLeft: 12 }}>微信：<strong style={{ color: 'var(--t2)' }}>{sysConfig.supportWeChat}</strong></span>
              )}
              {sysConfig.supportNote && <span style={{ marginLeft: 8, color: 'var(--t3)', fontSize: 12 }}>（{sysConfig.supportNote}）</span>}
            </div>
          </>
        )}

        {/* ── 步骤2：选择钱包并提交 ── */}
        {step === 'pay' && selectedPlan && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
              <button onClick={handleBack} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)' }}>← 返回</button>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>
                  {getPlanStatus(selectedPlan) === 'upgrade' ? '升级套餐' :
                   getPlanStatus(selectedPlan) === 'current' ? '续费套餐' : '支付订阅费用'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--t3)' }}>{selectedPlan.name} · {CYCLE_LABEL[selectedPlan.cycle]} · ${selectedPlan.priceUsd}</div>
              </div>
            </div>

            {/* 升级提示 */}
            {getPlanStatus(selectedPlan) === 'upgrade' && (
              <div style={{
                background: 'rgba(240,180,41,0.07)', border: '1px solid rgba(240,180,41,0.3)',
                borderRadius: 12, padding: '12px 16px', marginBottom: 18,
                fontSize: 13, color: 'var(--t2)', lineHeight: 1.7,
              }}>
                📦 升级后将替换当前套餐，新套餐在管理员确认后立即生效。<br />
                <span style={{ fontSize: 12, color: 'var(--t3)' }}>
                  当前：{currentSub?.planName}（{fmtExpire(currentSub?.expireAt ?? '')} 到期）→ 升级至 {selectedPlan.name}（从确认日起 {selectedPlan.durationDays} 天）
                </span>
              </div>
            )}

            {/* 支付方式切换 */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
              {([true, false] as const).map(isAuto => (
                <button
                  key={String(isAuto)}
                  onClick={() => { setAutoPayMode(isAuto); setAutoPay(INITIAL_AUTO_PAY); clearPoll(); }}
                  style={{
                    flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 700,
                    border: 'none', cursor: 'pointer',
                    background: autoPayMode === isAuto ? 'linear-gradient(135deg, #f0b429, #e8920a)' : 'var(--bg3)',
                    color: autoPayMode === isAuto ? '#000' : 'var(--t2)',
                    transition: 'all .15s',
                  }}
                >
                  {isAuto ? '⚡ 自动支付（到账即开通）' : '手动支付（转账后提交凭证）'}
                </button>
              ))}
            </div>

            {/* ── 自动支付模式 ── */}
            {autoPayMode && (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px', marginBottom: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>⚡</span> TRC20 USDT 自动支付
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t3)', fontWeight: 400 }}>链上确认后自动开通，无需等待审核</span>
                </div>

                {autoPay.status === 'idle' && (
                  <button
                    onClick={handleCreateAutoPay}
                    style={{
                      width: '100%', padding: 14, borderRadius: 10,
                      background: 'linear-gradient(135deg, #f0b429, #e8920a)',
                      color: '#000', fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer',
                    }}
                  >
                    生成专属收款地址
                  </button>
                )}

                {autoPay.status === 'creating' && (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--t2)', fontSize: 14 }}>
                    正在生成收款地址...
                  </div>
                )}

                {autoPay.status === 'error' && (
                  <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>
                    ❌ 生成失败：{autoPay.errorMsg}<br />
                    <button onClick={handleCreateAutoPay} style={{ marginTop: 10, padding: '6px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'var(--bg3)', color: 'var(--t1)', border: '1px solid var(--border)' }}>重试</button>
                  </div>
                )}

                {(autoPay.status === 'waiting' || autoPay.status === 'finished') && (
                  <div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 4 }}>收款地址（TRC20 USDT）</div>
                      <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--t1)', wordBreak: 'break-all', letterSpacing: '.3px', marginBottom: 8 }}>
                        {autoPay.payAddress}
                      </div>
                      <button
                        onClick={() => { navigator.clipboard.writeText(autoPay.payAddress); showToast('✅ 地址已复制'); }}
                        style={{ padding: '3px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'transparent', color: 'var(--primary)', border: '1px solid rgba(240,180,41,0.3)' }}
                      >复制地址</button>
                    </div>
                    <div style={{ background: 'rgba(240,180,41,0.06)', border: '1px solid rgba(240,180,41,0.25)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--t2)', lineHeight: 2, marginBottom: 14 }}>
                      <div>💰 请向上方地址转账 <strong style={{ color: 'var(--primary)', fontSize: 15 }}>{autoPay.payAmount} {autoPay.payCurrency.toUpperCase()}</strong></div>
                      <div>⚠️ 请务必转入 <strong>精确金额</strong>，多转少转均可能导致确认失败</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)' }}>此地址仅本次有效，请勿重复使用</div>
                    </div>

                    {autoPay.status === 'waiting' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(0,150,255,0.06)', border: '1px solid rgba(0,150,255,0.2)', borderRadius: 10 }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: '50%',
                          border: '2px solid rgba(0,150,255,0.3)',
                          borderTop: '2px solid #4af',
                          animation: 'spin 1s linear infinite',
                          flexShrink: 0,
                        }} />
                        <span style={{ fontSize: 13, color: 'var(--t2)' }}>等待链上确认，到账后自动开通（TRC20 约 1-3 分钟）...</span>
                      </div>
                    )}
                    {autoPay.status === 'finished' && (
                      <div style={{ color: 'var(--green)', fontWeight: 700, fontSize: 14, textAlign: 'center' }}>
                        ✅ 已确认到账，订阅正在开通...
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── 手动支付模式 ── */}
            {!autoPayMode && (
              <>
            {/* 钱包地址选择 */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px', marginBottom: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>💳</span> 选择收款钱包
              </div>
              {wallets.length === 0 ? (
                <div style={{ color: 'var(--red)', fontSize: 13 }}>
                  ⚠️ 暂无可用收款钱包，请联系管理员：{sysConfig.supportEmail}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {wallets.map(w => (
                    <div key={w.id} onClick={() => setSelectedWallet(w)} style={{
                      border: `2px solid ${selectedWallet?.id === w.id ? 'var(--primary)' : 'var(--border)'}`,
                      background: selectedWallet?.id === w.id ? 'rgba(240,180,41,0.06)' : 'var(--bg3)',
                      borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'all .15s',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, color: 'var(--t1)', fontSize: 13 }}>{w.label}</span>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 20,
                          fontSize: 10, fontWeight: 700, background: 'rgba(240,180,41,0.1)', color: 'var(--primary)',
                        }}>{w.network}</span>
                      </div>
                      <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--t2)', wordBreak: 'break-all', letterSpacing: '.3px' }}>
                        {w.address}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(w.address); showToast('✅ 地址已复制'); }}
                        style={{ marginTop: 8, padding: '3px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'transparent', color: 'var(--primary)', border: '1px solid rgba(240,180,41,0.3)' }}
                      >复制地址</button>
                    </div>
                  ))}
                </div>
              )}

              {selectedWallet && (
                <div style={{ marginTop: 16, background: 'rgba(240,180,41,0.06)', border: '1px solid rgba(240,180,41,0.25)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--t2)', lineHeight: 1.9 }}>
                  <div>📌 请向上方 <strong style={{ color: 'var(--primary)' }}>{selectedWallet.network}</strong> 地址转账 <strong style={{ color: 'var(--primary)' }}>${selectedPlan.priceUsd} USDT</strong></div>
                  <div>📧 转账备注请填写您的注册邮箱：<strong style={{ color: 'var(--primary)' }}>{user.email}</strong></div>
                  {sysConfig.paymentNote.split('\n').filter(l => l.trim() && !l.startsWith('📌') && !l.startsWith('📧')).map((line, i) => (
                    <div key={i} style={line.startsWith('⚠️') ? { color: 'var(--red)', marginTop: 4, fontSize: 12 } : {}}>{line}</div>
                  ))}
                </div>
              )}
            </div>

            {/* TxHash 填写 */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px', marginBottom: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🔗</span> 填写转账凭证
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  链上交易哈希（TxHash）<span style={{ color: 'var(--red)', fontSize: 13 }}>*</span>
                  <span style={{ color: 'var(--t3)', fontSize: 11 }}>必填，管理员凭此核对到账</span>
                </div>
                <input
                  value={txHash}
                  onChange={e => setTxHash(e.target.value)}
                  placeholder="粘贴链上 TxHash，如 0x... 或 tx 开头的哈希"
                  style={{
                    width: '100%', background: 'var(--bg3)',
                    border: `1px solid ${txHash.trim() ? 'var(--border)' : 'var(--red)'}`,
                    borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--t1)',
                    fontFamily: 'monospace', boxSizing: 'border-box',
                  }}
                />
                {!txHash.trim() && (
                  <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>请填写 TxHash 再提交，否则管理员无法核对</div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 6 }}>附言（可选）</div>
                <input
                  value={proofNote}
                  onChange={e => setProofNote(e.target.value)}
                  placeholder="如有特殊说明可在此填写"
                  style={{
                    width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--t1)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* 订阅说明（从后台 sysConfig 读取） */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 24px', marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 10 }}>📋 订阅说明</div>
              <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.9 }}>
                {/* 套餐相关动态信息 */}
                <div>• 有效期：开通之日起 <strong style={{ color: 'var(--t1)' }}>{selectedPlan.durationDays} 天</strong>，到期前续费可顺延</div>
                <div>• 每日限额：{selectedPlan.dailyLimit} 次 AI 分析 / 天，次日 00:00 重置</div>
                {/* 后台可编辑的通用说明 */}
                {sysConfig.subscriptionNote.split('\n').map((line, i) => (
                  line.trim() ? <div key={i}>{line.startsWith('•') ? line : `• ${line}`}</div> : null
                ))}
              </div>
              {/* 客服信息 */}
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--t3)' }}>
                如需帮助，请联系客服：
                <a href={`mailto:${sysConfig.supportEmail}`} style={{ color: 'var(--primary)', marginLeft: 4 }}>{sysConfig.supportEmail}</a>
                {sysConfig.supportWeChat && <span style={{ marginLeft: 10 }}>微信：<strong style={{ color: 'var(--t2)' }}>{sysConfig.supportWeChat}</strong></span>}
                {sysConfig.supportNote && <span style={{ marginLeft: 6, color: 'var(--t3)' }}>（{sysConfig.supportNote}）</span>}
              </div>
            </div>

            {/* 勾选 + 提交 */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20, cursor: 'pointer' }} onClick={() => setAgreed(v => !v)}>
              <div style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
                border: `2px solid ${agreed ? 'var(--primary)' : 'var(--border)'}`,
                background: agreed ? 'var(--primary)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
              }}>
                {agreed && <span style={{ fontSize: 11, color: '#000', fontWeight: 800 }}>✓</span>}
              </div>
              <span style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6 }}>
                我已完成转账，了解审核流程及不支持退款的规定
              </span>
            </div>

            <button onClick={handleSubmit} disabled={!selectedWallet} style={{
              width: '100%', padding: 15, borderRadius: 12,
              background: agreed && selectedWallet ? 'linear-gradient(135deg, #f0b429, #e8920a)' : 'var(--bg3)',
              color: agreed && selectedWallet ? '#000' : 'var(--t3)',
              fontWeight: 700, fontSize: 16, border: 'none',
              cursor: agreed && selectedWallet ? 'pointer' : 'default',
              transition: 'all .2s',
            }}>
              提交订阅申请 · {selectedPlan.name} · ${selectedPlan.priceUsd}
            </button>
            </>
            )}
          </>
        )}

        {/* ── 步骤3：提交完成 ── */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 60, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>
              {autoPayMode ? '订阅已自动开通！' : '订阅申请已提交'}
            </div>
            <div style={{ fontSize: 14, color: 'var(--t2)', lineHeight: 1.8, marginBottom: 10 }}>
              {autoPayMode
                ? <>链上已确认到账，您的订阅已自动激活，立即开始使用吧 🎉</>
                : <>管理员将在{sysConfig.reviewTimeNote}审核并开通订阅<br />开通后您的账户将自动生效，刷新页面即可查看</>
              }
            </div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 30 }}>
              有疑问请联系：<a href={`mailto:${sysConfig.supportEmail}`} style={{ color: 'var(--primary)' }}>{sysConfig.supportEmail}</a>
              {sysConfig.supportWeChat && <span style={{ marginLeft: 8 }}>微信：{sysConfig.supportWeChat}</span>}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => setStep('pick')} style={{
                padding: '11px 28px', borderRadius: 10, fontSize: 14, cursor: 'pointer',
                background: 'linear-gradient(135deg, #f0b429, #e8920a)', color: '#000', fontWeight: 700, border: 'none',
              }}>返回套餐页</button>
              <button onClick={() => navigate('app')} style={{
                padding: '11px 28px', borderRadius: 10, fontSize: 14, cursor: 'pointer',
                background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)',
              }}>返回分析</button>
            </div>
          </div>
        )}
      </div>

      {/* 我的订单抽屉 */}
      {showOrders && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)',
          zIndex: 3000, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
        }} onClick={e => { if (e.target === e.currentTarget) setShowOrders(false); }}>
          <div style={{
            width: 440, maxWidth: '95vw', height: '100vh', background: 'var(--bg2)',
            borderLeft: '1px solid var(--border)', padding: '24px 24px', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>我的订单</div>
              <button onClick={() => setShowOrders(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--t3)' }}>×</button>
            </div>
            {myOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--t3)', fontSize: 14 }}>暂无订单记录</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {myOrders.map(o => (
                  <div key={o.id} style={{
                    background: 'var(--bg3)', borderRadius: 12, padding: '14px 16px',
                    border: `1px solid ${o.status === 'confirmed' ? 'rgba(0,200,150,0.25)' : 'var(--border)'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--t1)' }}>{o.planName}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: statusColor[o.status] }}>
                        {ORDER_STATUS_LABEL[o.status]}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.7 }}>
                      <div>金额：<strong style={{ color: 'var(--primary)' }}>${o.amountUsd} USDT</strong> · {o.walletNetwork}</div>
                      <div>提交：{fmtTime(o.createdAt)}</div>
                      {o.confirmedAt && <div>审核：{fmtTime(o.confirmedAt)}</div>}
                      {o.adminNote && <div style={{ color: 'var(--t2)' }}>备注：{o.adminNote}</div>}
                    </div>
                    {o.status === 'confirmed' && (
                      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--green)' }}>
                        ✓ 订阅已开通，有效至 {fmtExpire(o.confirmedAt ?? o.createdAt)}（以实际开通时间为准）
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '12px 22px', borderRadius: 10, fontSize: 13,
          background: 'var(--bg2)', border: '1px solid var(--border)',
          color: 'var(--t1)', boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          zIndex: 9999, whiteSpace: 'nowrap',
        }}>{toast}</div>
      )}
    </div>
  );
}
