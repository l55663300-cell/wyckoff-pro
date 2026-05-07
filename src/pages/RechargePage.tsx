import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  getActivePlans, getActiveWallets, submitSubOrder, getUserSubOrders, getUserSubscription,
  CYCLE_LABEL, ORDER_STATUS_LABEL,
  type SubscriptionPlan, type PaymentWallet, type SubscriptionOrder, type UserSubscription,
} from '../utils/subscriptionStore';
import { loadSysConfig } from '../utils/sysConfigStore';
import { useT, getLang } from '../i18n';

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
  const t = useT();
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
  const [autoPayMode, setAutoPayMode] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentOrderId = useRef<string>('');

  const clearPoll = () => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
  };

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
      } catch { /* ignore polling errors */ }
    }, 8000);
  };

  const handleCreateAutoPay = async () => {
    if (!user || !selectedPlan) return;
    setAutoPay({ ...INITIAL_AUTO_PAY, status: 'creating' });

    const orderId = `SO${Date.now()}`;
    currentOrderId.current = orderId;

    try {
      const resp = await fetch('/api/nowpayments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price_amount: selectedPlan.priceUsd,
          order_id: orderId,
          order_description: `${selectedPlan.name} subscription — ${user.email}`,
          payer_email: user.email,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Network error' })) as { error?: string };
        throw new Error(err.error ?? `HTTP ${resp.status}`);
      }

      const payment = await resp.json() as {
        payment_id: number;
        pay_address: string;
        pay_amount: number;
        pay_currency: string;
      };

      const virtualWallet: PaymentWallet = {
        id: 'nowpayments_auto',
        label: 'TRC20 USDT (Auto)',
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
        `NowPayments auto payment, payment_id=${payment.payment_id}`,
      );

      setAutoPay({
        paymentId: payment.payment_id,
        payAddress: payment.pay_address,
        payAmount: payment.pay_amount,
        payCurrency: payment.pay_currency,
        status: 'waiting',
        errorMsg: '',
      });

      startPolling(orderId);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAutoPay({ ...INITIAL_AUTO_PAY, status: 'error', errorMsg: msg });
    }
  };

  useEffect(() => () => clearPoll(), []);

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
    setAutoPayMode(false);
    clearPoll();
    setStep('pay');
  };

  const handleSubmit = async () => {
    if (!agreed) { showToast(t.recharge.submitRequired); return; }
    if (!txHash.trim()) { showToast(t.recharge.txRequired); return; }
    if (!user) { navigate('login'); return; }
    if (!selectedPlan || !selectedWallet) return;
    await submitSubOrder({ uid: user.uid, email: user.email }, selectedPlan, selectedWallet, txHash.trim(), proofNote.trim() || undefined);
    const orders = await getUserSubOrders(user.uid);
    setMyOrders(orders);
    setStep('done');
  };

  const handleBack = () => { clearPoll(); setAutoPay(INITIAL_AUTO_PAY); setStep('pick'); setSelectedPlan(null); };

  if (!user) { navigate('login'); return null; }

  const locale = getLang() === 'en' ? 'en-US' : 'zh-CN';
  const fmtExpire = (iso: string) => { try { return new Date(iso).toLocaleDateString(locale); } catch { return iso; } };
  const fmtTime = (iso: string) => { try { return new Date(iso).toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };
  const statusColor: Record<string, string> = { pending: 'var(--primary)', confirmed: 'var(--green)', rejected: 'var(--red)' };

  const isSubActive = currentSub && new Date(currentSub.expireAt) > new Date();
  const sysConfig = loadSysConfig();

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
          <span>{t.recharge.navTitle}</span>
          <span style={{ margin: '0 4px', color: 'var(--t3)' }}>/</span>
          <span style={{ fontSize: 14, color: 'var(--t2)', fontWeight: 400 }}>{t.recharge.navCenter}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isSubActive && (
            <div style={{
              padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'rgba(0,200,150,0.1)', color: 'var(--green)',
              border: '1px solid rgba(0,200,150,0.25)',
            }}>
              {currentSub!.planName} · {t.recharge.remain(quota.daily, quota.total)}
            </div>
          )}
          <button onClick={() => setShowOrders(v => !v)} style={{
            padding: '7px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
            background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)',
          }}>{t.recharge.myOrders}</button>
          <button onClick={() => navigate('app')} style={{
            padding: '7px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
            background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)',
          }}>{t.recharge.backToApp}</button>
        </div>
      </nav>

      <div style={{ padding: '40px 20px', maxWidth: 900, margin: '0 auto' }}>

        {/* ── 当前订阅 Banner ── */}
        {step === 'pick' && isSubActive && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(0,200,150,0.08), rgba(0,150,100,0.05))',
            border: '1px solid rgba(0,200,150,0.25)', borderRadius: 16,
            padding: '18px 24px', marginBottom: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 4 }}>{t.recharge.currentSub}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t1)' }}>
                {currentSub!.planName}
                <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 400, color: 'var(--green)' }}>{t.recharge.subActive}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 3 }}>
                {t.recharge.subExpire(fmtExpire(currentSub!.expireAt))} · {t.recharge.subUsed(currentSub!.dailyLimit - quota.daily, currentSub!.dailyLimit)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowOrders(true)} style={{
                padding: '7px 16px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)',
              }}>{t.recharge.viewOrders}</button>
            </div>
          </div>
        )}

        {/* ── 步骤1：选择套餐 ── */}
        {step === 'pick' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>
                {isSubActive ? t.recharge.upgradeOrRenewTitle : t.recharge.pickPlanTitle}
              </h2>
              <p style={{ color: 'var(--t2)', fontSize: 14 }}>
                {t.recharge.payWithUsdt}{sysConfig.reviewTimeNote}
              </p>
            </div>

            {plans.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--t3)', fontSize: 14 }}>
                {t.recharge.noPlans}<br />
                <span style={{ fontSize: 12, marginTop: 8, display: 'inline-block' }}>
                  {t.recharge.contactEmail(sysConfig.supportEmail)}
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
                    ? t.recharge.btnCurrent
                    : isUpgrade
                    ? t.recharge.btnUpgrade
                    : planStatus === 'renew'
                    ? t.recharge.btnRenew
                    : planStatus === 'downgrade'
                    ? t.recharge.btnDowngrade
                    : t.recharge.btnNew;

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
                      {isCurrent && (
                        <div style={{
                          position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                          background: 'var(--green)', color: '#000', fontSize: 10, fontWeight: 800,
                          padding: '3px 16px', borderRadius: 20, whiteSpace: 'nowrap',
                        }}>{t.recharge.tagCurrent}</div>
                      )}
                      {!isCurrent && isUpgrade && (
                        <div style={{
                          position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                          background: 'var(--primary)', color: '#000', fontSize: 10, fontWeight: 800,
                          padding: '3px 16px', borderRadius: 20, whiteSpace: 'nowrap',
                        }}>{t.recharge.tagUpgrade}</div>
                      )}
                      {!isCurrent && !isUpgrade && plan.popular && (
                        <div style={{
                          position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                          background: 'var(--primary)', color: '#000', fontSize: 10, fontWeight: 800,
                          padding: '3px 16px', borderRadius: 20, whiteSpace: 'nowrap',
                        }}>{t.recharge.tagPopular}</div>
                      )}

                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)', marginBottom: 2 }}>{plan.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 16 }}>
                        {t.recharge.planCycleLabel(CYCLE_LABEL[plan.cycle], plan.durationDays)}
                      </div>
                      <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--primary)', lineHeight: 1 }}>
                        ${plan.priceUsd}
                        <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--t3)', marginLeft: 4 }}>
                          {t.recharge.planCycleUnit(CYCLE_LABEL[plan.cycle])}
                        </span>
                      </div>
                      <div style={{ margin: '16px 0', height: 1, background: 'var(--border)' }} />
                      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', fontSize: 12, color: 'var(--t2)', lineHeight: 2 }}>
                        <li><span style={{ color: 'var(--primary)', marginRight: 6 }}>⚡</span>{t.recharge.planDailyLimit(plan.dailyLimit)}</li>
                        <li><span style={{ color: 'var(--t3)', marginRight: 6 }}>🕐</span>{t.recharge.planHourlyLimit(plan.hourlyLimit)}</li>
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
              {t.recharge.contactSupport}
              <a href={`mailto:${sysConfig.supportEmail}`} style={{ color: 'var(--primary)', marginLeft: 6 }}>{sysConfig.supportEmail}</a>
              {sysConfig.supportWeChat && (
                <span style={{ marginLeft: 12 }}>{t.recharge.wechatSupport(sysConfig.supportWeChat)}</span>
              )}
              {sysConfig.supportNote && (
                <span style={{ marginLeft: 8, color: 'var(--t3)', fontSize: 12 }}>{t.recharge.supportNote(sysConfig.supportNote)}</span>
              )}
            </div>
          </>
        )}

        {/* ── 步骤2：选择钱包并提交 ── */}
        {step === 'pay' && selectedPlan && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
              <button onClick={handleBack} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)' }}>
                {t.recharge.backBtn}
              </button>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>
                  {getPlanStatus(selectedPlan) === 'upgrade' ? t.recharge.payUpgrade :
                   getPlanStatus(selectedPlan) === 'current' ? t.recharge.payRenew : t.recharge.payDefault}
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
                {t.recharge.upgradeNotice}<br />
                <span style={{ fontSize: 12, color: 'var(--t3)' }}>
                  {t.recharge.upgradeFrom(
                    currentSub?.planName ?? '',
                    fmtExpire(currentSub?.expireAt ?? ''),
                    selectedPlan.name,
                    selectedPlan.durationDays,
                  )}
                </span>
              </div>
            )}

            {/* 支付方式切换 */}
            {sysConfig.autoPayEnabled && (
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
                    {isAuto ? t.recharge.autoPayTab : t.recharge.manualPayTab}
                  </button>
                ))}
              </div>
            )}

            {/* ── 自动支付模式 ── */}
            {sysConfig.autoPayEnabled && autoPayMode && (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px', marginBottom: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>⚡</span> {t.recharge.autoPayTitle}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t3)', fontWeight: 400 }}>{t.recharge.autoPaySubtitle}</span>
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
                    {t.recharge.generateAddrBtn}
                  </button>
                )}

                {autoPay.status === 'creating' && (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--t2)', fontSize: 14 }}>
                    {t.recharge.generatingAddr}
                  </div>
                )}

                {autoPay.status === 'error' && (
                  <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>
                    {t.recharge.generateFailed(autoPay.errorMsg)}<br />
                    <button onClick={handleCreateAutoPay} style={{ marginTop: 10, padding: '6px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'var(--bg3)', color: 'var(--t1)', border: '1px solid var(--border)' }}>
                      {t.recharge.retryBtn}
                    </button>
                  </div>
                )}

                {(autoPay.status === 'waiting' || autoPay.status === 'finished') && (
                  <div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 4 }}>{t.recharge.autoPayAddrLabel}</div>
                      <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--t1)', wordBreak: 'break-all', letterSpacing: '.3px', marginBottom: 8 }}>
                        {autoPay.payAddress}
                      </div>
                      <button
                        onClick={() => { navigator.clipboard.writeText(autoPay.payAddress); showToast(t.recharge.addrCopied); }}
                        style={{ padding: '3px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'transparent', color: 'var(--primary)', border: '1px solid rgba(240,180,41,0.3)' }}
                      >{t.recharge.copyAddrBtn}</button>
                    </div>
                    <div style={{ background: 'rgba(240,180,41,0.06)', border: '1px solid rgba(240,180,41,0.25)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--t2)', lineHeight: 2, marginBottom: 14 }}>
                      <div>{t.recharge.autoPayAmountHint(autoPay.payAmount, autoPay.payCurrency)}</div>
                      <div>{t.recharge.autoPayExactHint}</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)' }}>{t.recharge.autoPayOneTime}</div>
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
                        <span style={{ fontSize: 13, color: 'var(--t2)' }}>{t.recharge.autoPayWaiting}</span>
                      </div>
                    )}
                    {autoPay.status === 'finished' && (
                      <div style={{ color: 'var(--green)', fontWeight: 700, fontSize: 14, textAlign: 'center' }}>
                        {t.recharge.autoPayFinished}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── 手动支付模式 ── */}
            {(!sysConfig.autoPayEnabled || !autoPayMode) && (
              <>
                {/* 钱包地址选择 */}
                <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px', marginBottom: 18 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>💳</span> {t.recharge.walletSectionTitle}
                  </div>
                  {wallets.length === 0 ? (
                    <div style={{ color: 'var(--red)', fontSize: 13 }}>
                      {t.recharge.walletNone(sysConfig.supportEmail)}
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
                            onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(w.address); showToast(t.recharge.addrCopied); }}
                            style={{ marginTop: 8, padding: '3px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'transparent', color: 'var(--primary)', border: '1px solid rgba(240,180,41,0.3)' }}
                          >{t.recharge.walletCopyBtn}</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedWallet && (
                    <div style={{ marginTop: 16, background: 'rgba(240,180,41,0.06)', border: '1px solid rgba(240,180,41,0.25)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--t2)', lineHeight: 1.9 }}>
                      <div>📌 {getLang() === 'en'
                        ? `Please send $${selectedPlan.priceUsd} USDT to the ${selectedWallet.network} address above`
                        : `请向上方 ${selectedWallet.network} 地址转账 $${selectedPlan.priceUsd} USDT`}
                      </div>
                      <div>📧 {getLang() === 'en'
                        ? `Use your registered email as memo: ${user.email}`
                        : `转账备注请填写您的注册邮箱：${user.email}`}
                      </div>
                      {sysConfig.paymentNote.split('\n').filter(l => l.trim() && !l.startsWith('📌') && !l.startsWith('📧')).map((line, i) => (
                        <div key={i} style={line.startsWith('⚠️') ? { color: 'var(--red)', marginTop: 4, fontSize: 12 } : {}}>{line}</div>
                      ))}
                    </div>
                  )}
                </div>

                {/* TxHash 填写 */}
                <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px', marginBottom: 18 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>🔗</span> {t.recharge.proofSectionTitle}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {t.recharge.txHashLabel}<span style={{ color: 'var(--red)', fontSize: 13 }}>*</span>
                      <span style={{ color: 'var(--t3)', fontSize: 11 }}>{t.recharge.txHashRequired}</span>
                    </div>
                    <input
                      value={txHash}
                      onChange={e => setTxHash(e.target.value)}
                      placeholder={t.recharge.txHashPlaceholder}
                      style={{
                        width: '100%', background: 'var(--bg3)',
                        border: `1px solid ${txHash.trim() ? 'var(--border)' : 'var(--red)'}`,
                        borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--t1)',
                        fontFamily: 'monospace', boxSizing: 'border-box',
                      }}
                    />
                    {!txHash.trim() && (
                      <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{t.recharge.txHashMissing}</div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 6 }}>{t.recharge.noteLabel}</div>
                    <input
                      value={proofNote}
                      onChange={e => setProofNote(e.target.value)}
                      placeholder={t.recharge.notePlaceholder}
                      style={{
                        width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--t1)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                {/* 订阅说明 */}
                <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 24px', marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 10 }}>{t.recharge.subNoteTitle}</div>
                  <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.9 }}>
                    <div>{t.recharge.subNoteDuration(selectedPlan.durationDays)}</div>
                    <div>{t.recharge.subNoteLimit(selectedPlan.dailyLimit)}</div>
                    {sysConfig.subscriptionNote.split('\n').map((line, i) => (
                      line.trim() ? <div key={i}>{line.startsWith('•') ? line : `• ${line}`}</div> : null
                    ))}
                  </div>
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--t3)' }}>
                    {t.recharge.subNoteContact}
                    <a href={`mailto:${sysConfig.supportEmail}`} style={{ color: 'var(--primary)', marginLeft: 4 }}>{sysConfig.supportEmail}</a>
                    {sysConfig.supportWeChat && <span style={{ marginLeft: 10 }}>{t.recharge.wechatSupport(sysConfig.supportWeChat)}</span>}
                    {sysConfig.supportNote && <span style={{ marginLeft: 6, color: 'var(--t3)' }}>{t.recharge.supportNote(sysConfig.supportNote)}</span>}
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
                    {t.recharge.agreedText}
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
                  {t.recharge.submitBtn(selectedPlan.name, String(selectedPlan.priceUsd))}
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
              {autoPayMode ? t.recharge.doneAutoTitle : t.recharge.doneManualTitle}
            </div>
            <div style={{ fontSize: 14, color: 'var(--t2)', lineHeight: 1.8, marginBottom: 10 }}>
              {autoPayMode
                ? <>{t.recharge.doneAutoDesc}</>
                : <>{t.recharge.doneManualDesc(sysConfig.reviewTimeNote)}<br />{t.recharge.doneManualDesc2}</>
              }
            </div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 30 }}>
              {t.recharge.doneContact(sysConfig.supportEmail)}
              {sysConfig.supportWeChat && <span style={{ marginLeft: 8 }}>{t.recharge.doneWechat(sysConfig.supportWeChat)}</span>}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => setStep('pick')} style={{
                padding: '11px 28px', borderRadius: 10, fontSize: 14, cursor: 'pointer',
                background: 'linear-gradient(135deg, #f0b429, #e8920a)', color: '#000', fontWeight: 700, border: 'none',
              }}>{t.recharge.backToPick}</button>
              <button onClick={() => navigate('app')} style={{
                padding: '11px 28px', borderRadius: 10, fontSize: 14, cursor: 'pointer',
                background: 'transparent', color: 'var(--t2)', border: '1px solid var(--border)',
              }}>{t.recharge.backToApp2}</button>
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
              <div style={{ fontSize: 16, fontWeight: 700 }}>{t.recharge.ordersTitle}</div>
              <button onClick={() => setShowOrders(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--t3)' }}>×</button>
            </div>
            {myOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--t3)', fontSize: 14 }}>{t.recharge.ordersEmpty}</div>
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
                      <div>{t.recharge.orderAmount(String(o.amountUsd), o.walletNetwork)}</div>
                      <div>{t.recharge.orderSubmittedAt}{fmtTime(o.createdAt)}</div>
                      {o.confirmedAt && <div>{t.recharge.orderReviewedAt}{fmtTime(o.confirmedAt)}</div>}
                      {o.adminNote && <div style={{ color: 'var(--t2)' }}>{t.recharge.orderNote}{o.adminNote}</div>}
                    </div>
                    {o.status === 'confirmed' && (
                      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--green)' }}>
                        {t.recharge.orderConfirmedHint(fmtExpire(o.confirmedAt ?? o.createdAt))}
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
