import React, { useState, useCallback, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../components/Toast';
import {
  apiLogin,
  apiRegister,
  apiResetRequest,
  checkPasswordStrength,
  PASSWORD_RE,
  type ApiError,
} from '../api/auth';
import { useT } from '../i18n';


type AuthView = 'login' | 'register' | 'forgot';

// 验证码相关 API（走 Cloudflare Function）
async function sendVerifyCode(email: string): Promise<void> {
  const resp = await fetch('/api/email/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await resp.json() as { ok?: boolean; error?: string };
  if (!resp.ok || !data.ok) throw new Error(data.error ?? 'Failed to send code');
}

async function verifyCode(email: string, code: string): Promise<void> {
  const resp = await fetch('/api/email/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  const data = await resp.json() as { ok?: boolean; error?: string };
  if (!resp.ok || !data.ok) throw new Error(data.error ?? 'Invalid code');
}

interface LoginModalProps {
  defaultTab?: 'login' | 'register';
  onClose: () => void;
}

// ─── 密码强度条 ────────────────────────────────────────────────────────────────
function PasswordStrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const t = useT();
  const { score, tips } = checkPasswordStrength(password);
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e'];
  const labels = [t.auth.pwStrengthTooWeak, t.auth.pwStrengthWeak, t.auth.pwStrengthMedium, t.auth.pwStrengthStrong];
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 99,
            background: i < score ? colors[score - 1] : 'var(--border)',
            transition: 'background 0.2s',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: score > 0 ? colors[score - 1] : 'var(--t3)' }}>
          {score > 0 ? labels[score - 1] : t.auth.pwStrengthEnter}
        </span>
        {tips.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>{t.auth.pwStrengthMore}{tips.join('、')}</span>
        )}
      </div>
    </div>
  );
}

// ─── 输入框封装 ────────────────────────────────────────────────────────────────
function Field({
  label, hint, type = 'text', placeholder, value, onChange, onBlur, onEnter,
  error, disabled, badge,
}: {
  label: string; hint?: string; type?: string; placeholder?: string;
  value: string; onChange: (v: string) => void; onBlur?: () => void;
  onEnter?: () => void; error?: string; disabled?: boolean; badge?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}
        {hint && <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 400 }}>{hint}</span>}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); onBlur?.(); }}
          onKeyDown={e => e.key === 'Enter' && onEnter?.()}
          style={{
            width: '100%', padding: badge ? '11px 52px 11px 14px' : '11px 14px',
            borderRadius: 9, boxSizing: 'border-box',
            background: disabled ? 'var(--bg3)' : 'var(--bg3)',
            border: `1px solid ${error ? 'rgba(239,68,68,0.6)' : focused ? '#f0b429' : 'var(--border)'}`,
            color: 'var(--t1)', fontSize: 14, outline: 'none',
            opacity: disabled ? 0.5 : 1,
            transition: 'border-color 0.15s',
          }}
        />
        {badge && (
          <span style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            fontSize: 11, color: 'var(--t3)', pointerEvents: 'none',
          }}>{badge}</span>
        )}
      </div>
      {error && (
        <p style={{ fontSize: 11, color: '#f87171', marginTop: 3, marginBottom: 0 }}>{error}</p>
      )}
    </div>
  );
}

// ─── 主 Modal ─────────────────────────────────────────────────────────────────
export function LoginModal({ defaultTab = 'login', onClose }: LoginModalProps) {
  const { login } = useApp();
  const { showToast } = useToast();
  const tr = useT();
  const [view, setView] = useState<AuthView>(defaultTab);

  // 公用字段
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // 找回密码
  const [resetSent, setResetSent] = useState(false);
  // 验证码相关
  const [codeSent, setCodeSent] = useState(false);
  const [verifyCodeVal, setVerifyCodeVal] = useState('');
  const [codeVerified, setCodeVerified] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeCountdown, setCodeCountdown] = useState(0);

  // ── 登录失败计数 + 临时锁定（防暴力破解） ──────────────────────────────────
  const LOGIN_FAIL_KEY = 'wyckoff_login_fail';
  const MAX_FAIL = 5;         // 最多连续失败次数
  const LOCK_MS = 30 * 60 * 1000; // 锁定 30 分钟

  interface FailRecord { count: number; lockedUntil: number; }

  const getFailRecord = (): FailRecord => {
    try {
      const raw = sessionStorage.getItem(LOGIN_FAIL_KEY);
      return raw ? JSON.parse(raw) : { count: 0, lockedUntil: 0 };
    } catch { return { count: 0, lockedUntil: 0 }; }
  };

  const setFailRecord = (r: FailRecord) => {
    try { sessionStorage.setItem(LOGIN_FAIL_KEY, JSON.stringify(r)); } catch {}
  };

  const isLocked = (): number => {
    const r = getFailRecord();
    if (r.lockedUntil > Date.now()) return Math.ceil((r.lockedUntil - Date.now()) / 60000);
    return 0;
  };

  // 数学验证码（防机器人注册）
  const genMathChallenge = () => {
    const ops = ['+', '-', '×'] as const;
    const op = ops[Math.floor(Math.random() * 3)];
    let a = Math.floor(Math.random() * 9) + 1;
    let b = Math.floor(Math.random() * 9) + 1;
    if (op === '-' && b > a) [a, b] = [b, a];
    const answer = op === '+' ? a + b : op === '-' ? a - b : a * b;
    return { question: `${a} ${op} ${b} = ?`, answer };
  };
  const [mathChallenge, setMathChallenge] = useState(() => genMathChallenge());
  const [mathInput, setMathInput] = useState('');
  const [mathError, setMathError] = useState('');

  // 切换视图时清空错误
  const switchView = useCallback((v: AuthView) => {
    setView(v);
    setError('');
    setEmailError('');
    setResetSent(false);
    setCodeSent(false);
    setCodeVerified(false);
    setVerifyCodeVal('');
    setCodeCountdown(0);
  }, []);

  // 验证码倒计时
  useEffect(() => {
    if (codeCountdown <= 0) return;
    const timer = setTimeout(() => setCodeCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [codeCountdown]);

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // 邮箱格式校验（失焦时）
  const validateEmail = useCallback(() => {
    const v = email.trim();
    if (!v) { setEmailError(tr.auth.emailEmpty); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setEmailError(tr.auth.emailInvalid); return false; }
    setEmailError('');
    return true;
  }, [email, tr]);

  // ── 登录 ──
  const handleLogin = async () => {
    setError('');
    // 检查是否被锁定
    const remaining = isLocked();
    if (remaining > 0) {
      setError(`登录失败次数过多，请 ${remaining} 分钟后再试`);
      return;
    }
    if (!validateEmail()) return;
    if (!pw) { setError(tr.auth.passwordEmpty); return; }
    setLoading(true);
    try {
      const u = await apiLogin(email.trim(), pw);
      // 登录成功，清除失败记录
      setFailRecord({ count: 0, lockedUntil: 0 });
      login(u);
      onClose();
      showToast(tr.appPage.welcomeBack(u.name), 'success');
    } catch (e) {
      // 登录失败，累加计数
      const rec = getFailRecord();
      const newCount = rec.count + 1;
      const lockedUntil = newCount >= MAX_FAIL ? Date.now() + LOCK_MS : rec.lockedUntil;
      setFailRecord({ count: newCount, lockedUntil });
      if (newCount >= MAX_FAIL) {
        setError(`连续失败 ${MAX_FAIL} 次，账号已临时锁定 30 分钟`);
      } else {
        setError((e as ApiError).message ?? tr.appPage.loginFailed);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── 发送验证码 ──
  const handleSendCode = async () => {
    setError('');
    setMathError('');
    if (!validateEmail()) return;
    const ans = parseInt(mathInput.trim(), 10);
    if (isNaN(ans) || ans !== mathChallenge.answer) {
      setMathError(tr.auth.mathWrong);
      setMathChallenge(genMathChallenge());
      setMathInput('');
      return;
    }
    setSendingCode(true);
    try {
      await sendVerifyCode(email.trim().toLowerCase());
      setCodeSent(true);
      setCodeCountdown(60);
    } catch (e) {
      setError((e as Error).message ?? tr.appPage.sendFailed);
    } finally {
      setSendingCode(false);
    }
  };

  // ── 校验验证码 ──
  const handleVerifyCode = async () => {
    setError('');
    if (!verifyCodeVal.trim()) { setError(tr.auth.codeEmpty); return; }
    setLoading(true);
    try {
      await verifyCode(email.trim().toLowerCase(), verifyCodeVal.trim());
      setCodeVerified(true);
    } catch (e) {
      setError((e as Error).message ?? tr.appPage.codeError);
    } finally {
      setLoading(false);
    }
  };

  // ── 注册 ──
  const handleRegister = async () => {
    setError('');
    if (!validateEmail()) return;
    if (!PASSWORD_RE.test(pw)) {
      setError(tr.auth.passwordWeak);
      return;
    }
    if (pw !== pw2) { setError(tr.auth.confirmPasswordError); return; }
    if (!agreed) { setError(tr.auth.agreementRequired); return; }

    setLoading(true);
    try {
      const u = await apiRegister(email.trim(), pw, agreed, inviteCode || undefined);
      login(u);
      onClose();
      showToast(tr.appPage.registerSuccess(u.welcomeCredits), 'success', 5000);
    } catch (e) {
      setError((e as ApiError).message ?? tr.appPage.registerFailed);
    } finally {
      setLoading(false);
    }
  };

  // ── 找回密码 ──
  const handleResetRequest = async () => {
    setError('');
    if (!validateEmail()) return;
    setLoading(true);
    try {
      await apiResetRequest(email.trim());
      setResetSent(true);
    } catch (e) {
      setError((e as ApiError).message ?? tr.appPage.resetFailed);
    } finally {
      setLoading(false);
    }
  };

  // ── 样式常量 ──
  const btnPrimary: React.CSSProperties = {
    width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
    cursor: loading ? 'not-allowed' : 'pointer',
    background: 'linear-gradient(135deg, #f0b429, #e8920a)',
    color: '#000', fontWeight: 700, fontSize: 15,
    opacity: loading ? 0.7 : 1,
    transition: 'opacity 0.15s, transform 0.1s',
  };

  const tabLabels: Record<AuthView, string> = {
    login: tr.auth.tabLogin,
    register: tr.auth.tabRegister,
    forgot: tr.auth.tabForgot,
  };

  const stepLabels = [tr.auth.step1, tr.auth.step2, tr.auth.step3];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20,
          padding: '36px 40px 32px', width: 440, maxWidth: '100%', position: 'relative',
          boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
          animation: 'modal-in 0.18s ease',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {/* 关闭按钮 */}
        <button onClick={onClose} style={{
          position: 'absolute', top: 14, right: 14,
          width: 30, height: 30, borderRadius: '50%', border: 'none',
          background: 'var(--bg3)', color: 'var(--t3)', fontSize: 16,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>×</button>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <span style={{ fontSize: 26 }}>🦞</span>
          <span style={{ fontWeight: 700, fontSize: 17 }}>{tr.landing.brandName}</span>
        </div>

        {/* Tab 切换（login / register，forgot 不在 Tab 里） */}
        {view !== 'forgot' && (
          <div style={{ display: 'flex', background: 'var(--bg3)', borderRadius: 12, padding: 4, marginBottom: 24 }}>
            {(['login', 'register'] as const).map(tab => (
              <button key={tab} onClick={() => switchView(tab)} style={{
                flex: 1, padding: 9, borderRadius: 9, border: 'none', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', transition: 'all .15s',
                background: view === tab ? 'var(--bg2)' : 'none',
                color: view === tab ? 'var(--t1)' : 'var(--t3)',
                boxShadow: view === tab ? '0 1px 4px rgba(0,0,0,.3)' : 'none',
              }}>{tabLabels[tab]}</button>
            ))}
          </div>
        )}

        {/* 找回密码标题 */}
        {view === 'forgot' && (
          <div style={{ marginBottom: 20 }}>
            <button onClick={() => switchView('login')} style={{
              background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer',
              fontSize: 13, padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4,
            }}>{tr.auth.backToLogin}</button>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{tr.auth.forgotTitle}</h3>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--t2)' }}>
              {tr.auth.forgotDesc}
            </p>
          </div>
        )}

        {/* 全局错误提示 */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8, padding: '9px 13px', fontSize: 13, color: '#f87171', marginBottom: 16,
            display: 'flex', alignItems: 'flex-start', gap: 6,
          }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── 登录表单 ── */}
        {view === 'login' && (
          <div>
            <Field label={tr.auth.emailLabel} type="email" placeholder={tr.auth.emailPlaceholder}
              value={email} onChange={v => { setEmail(v); setEmailError(''); }}
              onBlur={validateEmail} error={emailError} disabled={loading} />
            <Field label={tr.auth.passwordLabel} type="password" placeholder={tr.auth.passwordPlaceholder}
              value={pw} onChange={setPw} disabled={loading}
              onEnter={handleLogin} />

            <div style={{ textAlign: 'right', marginBottom: 20, marginTop: -8 }}>
              <button onClick={() => switchView('forgot')} style={{
                background: 'none', border: 'none', fontSize: 13,
                color: 'var(--t2)', cursor: 'pointer', padding: 0,
              }}>{tr.auth.forgotPassword}</button>
            </div>

            <button onClick={handleLogin} disabled={loading} style={btnPrimary}>
              {loading ? tr.auth.loggingIn : tr.auth.loginBtn}
            </button>

            <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--t2)' }}>
              {tr.auth.noAccount}
              <button onClick={() => switchView('register')} style={{
                background: 'none', border: 'none', color: '#f0b429',
                cursor: 'pointer', fontSize: 13, padding: 0, fontWeight: 600,
              }}>{tr.auth.freeRegister}</button>
            </div>
          </div>
        )}

        {/* ── 注册表单 ── */}
        {view === 'register' && (
          <div>
            {/* 步骤指示器 */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 22, gap: 0 }}>
              {stepLabels.map((label, i) => {
                const n = i + 1;
                const arr = stepLabels;
                return (
                  <React.Fragment key={n}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700,
                        background: (n === 1 && !codeSent) || (n === 2 && codeSent && !codeVerified) || (n === 3 && codeVerified)
                          ? '#f0b429' : (n < (codeVerified ? 3 : codeSent ? 2 : 1)) ? 'var(--green)' : 'var(--bg3)',
                        color: (n === 1 && !codeSent) || (n === 2 && codeSent && !codeVerified) || (n === 3 && codeVerified)
                          ? '#000' : 'var(--t3)',
                      }}>{n < (codeVerified ? 3 : codeSent ? 2 : 1) ? '✓' : n}</div>
                      <span style={{ fontSize: 10, color: 'var(--t3)', whiteSpace: 'nowrap' }}>{label}</span>
                    </div>
                    {i < arr.length - 1 && (
                      <div style={{ flex: 1, height: 1, background: 'var(--border)', margin: '0 6px', marginBottom: 16 }} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* 步骤1：填写邮箱 + 发验证码 */}
            {!codeSent && (
              <>
                <Field label={tr.auth.emailLabel} type="email" placeholder={tr.auth.emailPlaceholder}
                  value={email} onChange={v => { setEmail(v); setEmailError(''); }}
                  onBlur={validateEmail} error={emailError} disabled={sendingCode} />

                {/* 数学验证码（防机器人） */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 13, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    {tr.auth.securityLabel}
                    <span style={{ fontSize: 11, color: 'var(--t3)' }}>{tr.auth.securityHint}</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      padding: '10px 16px', borderRadius: 9, background: 'rgba(240,180,41,0.08)',
                      border: '1px solid rgba(240,180,41,0.25)', fontSize: 16, fontWeight: 700,
                      color: 'var(--primary)', letterSpacing: 2, flexShrink: 0,
                    }}>
                      {mathChallenge.question}
                    </div>
                    <input
                      type="number"
                      placeholder={tr.auth.mathAnswerPlaceholder}
                      value={mathInput}
                      onChange={e => { setMathInput(e.target.value); setMathError(''); }}
                      onKeyDown={e => { if (e.key === 'Enter') handleSendCode(); }}
                      disabled={sendingCode}
                      style={{
                        width: 80, padding: '10px 12px', borderRadius: 9, boxSizing: 'border-box',
                        background: 'var(--bg3)', border: `1px solid ${mathError ? 'rgba(239,68,68,0.6)' : 'var(--border)'}`,
                        color: 'var(--t1)', fontSize: 15, fontWeight: 700, outline: 'none', textAlign: 'center',
                      }}
                      onFocus={e => (e.target.style.borderColor = '#f0b429')}
                      onBlur={e => (e.target.style.borderColor = mathError ? 'rgba(239,68,68,0.6)' : 'var(--border)')}
                    />
                    <button
                      onClick={() => { setMathChallenge(genMathChallenge()); setMathInput(''); setMathError(''); }}
                      title="换一题"
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', color: 'var(--t3)', fontSize: 13 }}
                    >🔄</button>
                  </div>
                  {mathError && <p style={{ fontSize: 11, color: '#f87171', marginTop: 4, marginBottom: 0 }}>{mathError}</p>}
                </div>

                <button onClick={handleSendCode} disabled={sendingCode} style={{
                  ...btnPrimary,
                  background: sendingCode ? 'var(--bg3)' : 'linear-gradient(135deg,#f0b429,#e8920a)',
                  color: sendingCode ? 'var(--t3)' : '#000',
                }}>
                  {sendingCode ? tr.auth.sendingCode : tr.auth.sendCodeBtn}
                </button>
              </>
            )}

            {/* 步骤2：输入验证码 */}
            {codeSent && !codeVerified && (
              <>
                <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(77,159,255,0.08)', borderRadius: 8, fontSize: 13, color: 'var(--t2)' }}>
                  {tr.auth.codeSentTo} <strong style={{ color: 'var(--t1)' }}>{email.trim()}</strong>{tr.auth.codeCheckSpam}
                </div>
                <Field label={tr.auth.codeLabel} type="text" placeholder={tr.auth.codePlaceholder}
                  value={verifyCodeVal} onChange={v => setVerifyCodeVal(v.replace(/\D/g, '').slice(0, 6))}
                  disabled={loading} onEnter={handleVerifyCode} />
                <button onClick={handleVerifyCode} disabled={loading || verifyCodeVal.length < 6} style={{
                  ...btnPrimary,
                  opacity: loading || verifyCodeVal.length < 6 ? 0.6 : 1,
                }}>
                  {loading ? tr.auth.verifyingBtn : tr.auth.verifyBtn}
                </button>
                <div style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: 'var(--t3)' }}>
                  {tr.auth.noCode}
                  {codeCountdown > 0 ? (
                    <span style={{ color: 'var(--t3)' }}> {tr.auth.resendIn(codeCountdown)}</span>
                  ) : (
                    <button onClick={handleSendCode} disabled={sendingCode} style={{
                      background: 'none', border: 'none', color: '#f0b429', cursor: 'pointer', fontSize: 13, padding: 0,
                    }}>{sendingCode ? tr.auth.sendingCode : tr.auth.resendBtn}</button>
                  )}
                </div>
              </>
            )}

            {/* 步骤3：设置密码完成注册 */}
            {codeVerified && (
              <>
                <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(34,197,94,0.08)', borderRadius: 8, fontSize: 13, color: '#4ade80', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span>✓</span> {tr.auth.emailVerified}: <strong>{email.trim()}</strong>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 5, display: 'block' }}>{tr.auth.setPasswordLabel}</label>
                  <input
                    type="password"
                    placeholder={tr.auth.setPasswordPlaceholder}
                    value={pw}
                    disabled={loading}
                    onChange={e => setPw(e.target.value)}
                    style={{
                      width: '100%', padding: '11px 14px', borderRadius: 9, boxSizing: 'border-box',
                      background: 'var(--bg3)', border: '1px solid var(--border)',
                      color: 'var(--t1)', fontSize: 14, outline: 'none',
                      opacity: loading ? 0.5 : 1,
                    }}
                    onFocus={e => (e.target.style.borderColor = '#f0b429')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                  />
                  <PasswordStrengthBar password={pw} />
                </div>

                <Field label={tr.auth.confirmPasswordLabel} type="password" placeholder={tr.auth.confirmPasswordPlaceholder}
                  value={pw2} onChange={setPw2} disabled={loading}
                  error={pw2 && pw !== pw2 ? tr.auth.confirmPasswordError : ''}
                  onEnter={handleRegister} />

                <Field label={tr.auth.inviteCodeLabel} hint={tr.auth.inviteCodeHint}
                  placeholder={tr.auth.inviteCodePlaceholder} value={inviteCode}
                  onChange={v => setInviteCode(v.toUpperCase())}
                  disabled={loading} badge={tr.auth.inviteCodeBadge} />

                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--t2)', lineHeight: 1.6 }}>
                    <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                      disabled={loading}
                      style={{ marginTop: 2, accentColor: '#f0b429', flexShrink: 0 }} />
                    {tr.auth.agreeText}&nbsp;
                    <a style={{ color: '#f0b429', cursor: 'pointer', textDecoration: 'none' }}>{tr.auth.termsLink}</a>
                    &nbsp;{tr.appPage.andWord}&nbsp;
                    <a style={{ color: '#f0b429', cursor: 'pointer', textDecoration: 'none' }}>{tr.auth.privacyLink}</a>
                  </label>
                </div>

                <button onClick={handleRegister} disabled={loading} style={btnPrimary}>
                  {loading ? tr.auth.creatingBtn : tr.auth.createAccountBtn}
                </button>

                <div style={{
                  marginTop: 14, padding: '10px 12px',
                  background: 'rgba(240,180,41,0.06)', border: '1px solid rgba(240,180,41,0.2)',
                  borderRadius: 10, fontSize: 12, color: 'var(--t2)', lineHeight: 1.6,
                }}>
                  {tr.auth.registerGift}
                </div>
              </>
            )}

            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: 'var(--t2)' }}>
              {tr.auth.hasAccount}
              <button onClick={() => switchView('login')} style={{
                background: 'none', border: 'none', color: '#f0b429',
                cursor: 'pointer', fontSize: 13, padding: 0, fontWeight: 600,
              }}>{tr.auth.backToLogin}</button>
            </div>
          </div>
        )}

        {/* ── 找回密码 ── */}
        {view === 'forgot' && (
          <div>
            {!resetSent ? (
              <>
                <Field label={tr.auth.forgotEmailLabel} type="email" placeholder={tr.auth.emailPlaceholder}
                  value={email} onChange={v => { setEmail(v); setEmailError(''); }}
                  onBlur={validateEmail} error={emailError} disabled={loading}
                  onEnter={handleResetRequest} />

                <button onClick={handleResetRequest} disabled={loading} style={btnPrimary}>
                  {loading ? tr.auth.sendingResetBtn : tr.auth.sendResetBtn}
                </button>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
                <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 8px' }}>{tr.auth.resetSentTitle}</p>
                <p style={{ fontSize: 13, color: 'var(--t2)', margin: '0 0 20px', lineHeight: 1.6 }}>
                  {tr.auth.resetSentDesc}<br />
                  <strong style={{ color: 'var(--t1)' }}>{email.trim()}</strong><br />
                  {tr.auth.resetSentDesc2}
                </p>
                <p style={{ fontSize: 12, color: 'var(--t3)', margin: '0 0 20px' }}>
                  {tr.auth.resetNoEmail}
                  <button onClick={() => { setResetSent(false); setError(''); }} style={{
                    background: 'none', border: 'none', color: '#f0b429', cursor: 'pointer',
                    fontSize: 12, padding: 0,
                  }}>{tr.auth.resetResend}</button>
                </p>
                <button onClick={() => switchView('login')} style={{
                  ...btnPrimary, width: 'auto', padding: '10px 28px',
                }}>{tr.auth.backToLoginBtn}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 兼容旧路由 */
export default function LoginPage() {
  return null;
}
