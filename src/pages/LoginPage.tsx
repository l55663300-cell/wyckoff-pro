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

type AuthView = 'login' | 'register' | 'forgot';

// 验证码相关 API（走 Cloudflare Function）
async function sendVerifyCode(email: string): Promise<void> {
  const resp = await fetch('/api/email/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await resp.json() as { ok?: boolean; error?: string };
  if (!resp.ok || !data.ok) throw new Error(data.error ?? '验证码发送失败');
}

async function verifyCode(email: string, code: string): Promise<void> {
  const resp = await fetch('/api/email/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  const data = await resp.json() as { ok?: boolean; error?: string };
  if (!resp.ok || !data.ok) throw new Error(data.error ?? '验证码错误');
}

interface LoginModalProps {
  defaultTab?: 'login' | 'register';
  onClose: () => void;
}

// ─── 密码强度条 ────────────────────────────────────────────────────────────────
function PasswordStrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const { score, tips } = checkPasswordStrength(password);
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e'];
  const labels = ['太弱', '弱', '中等', '强'];
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
          {score > 0 ? labels[score - 1] : '请输入密码'}
        </span>
        {tips.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>还需：{tips.join('、')}</span>
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
    const t = setTimeout(() => setCodeCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
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
    if (!v) { setEmailError('请填写邮箱地址'); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setEmailError('邮箱格式不正确'); return false; }
    setEmailError('');
    return true;
  }, [email]);

  // ── 登录 ──
  const handleLogin = async () => {
    setError('');
    if (!validateEmail()) return;
    if (!pw) { setError('请输入密码'); return; }
    setLoading(true);
    try {
      const u = await apiLogin(email.trim(), pw);
      login(u);
      // login() 内部会跳转 page，onClose 负责关闭 Modal
      onClose();
      showToast(`欢迎回来，${u.name}`, 'success');
    } catch (e) {
      setError((e as ApiError).message ?? '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // ── 发送验证码 ──
  const handleSendCode = async () => {
    setError('');
    if (!validateEmail()) return;
    setSendingCode(true);
    try {
      await sendVerifyCode(email.trim().toLowerCase());
      setCodeSent(true);
      setCodeCountdown(60);
    } catch (e) {
      setError((e as Error).message ?? '发送失败，请稍后重试');
    } finally {
      setSendingCode(false);
    }
  };

  // ── 校验验证码 ──
  const handleVerifyCode = async () => {
    setError('');
    if (!verifyCodeVal.trim()) { setError('请输入验证码'); return; }
    setLoading(true);
    try {
      await verifyCode(email.trim().toLowerCase(), verifyCodeVal.trim());
      setCodeVerified(true);
    } catch (e) {
      setError((e as Error).message ?? '验证码错误');
    } finally {
      setLoading(false);
    }
  };

  // ── 注册 ──
  const handleRegister = async () => {
    setError('');
    if (!validateEmail()) return;
    if (!PASSWORD_RE.test(pw)) {
      setError('密码需8位以上且包含字母、数字、特殊字符');
      return;
    }
    if (pw !== pw2) { setError('两次密码不一致'); return; }
    if (!agreed) { setError('请先同意服务条款和隐私政策'); return; }

    setLoading(true);
    try {
      const u = await apiRegister(email.trim(), pw, agreed, inviteCode || undefined);
      login(u);
      onClose();
      showToast(`注册成功！已赠送 ${u.welcomeCredits} 次免费额度 🎁`, 'success', 5000);
    } catch (e) {
      setError((e as ApiError).message ?? '注册失败，请稍后重试');
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
      setError((e as ApiError).message ?? '发送失败，请稍后重试');
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
    login: '登录',
    register: '注册账号',
    forgot: '找回密码',
  };

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
          <span style={{ fontWeight: 700, fontSize: 17 }}>AI威科夫Pro</span>
        </div>

        {/* Tab 切换（login / register，forgot 不在 Tab 里） */}
        {view !== 'forgot' && (
          <div style={{ display: 'flex', background: 'var(--bg3)', borderRadius: 12, padding: 4, marginBottom: 24 }}>
            {(['login', 'register'] as const).map(t => (
              <button key={t} onClick={() => switchView(t)} style={{
                flex: 1, padding: 9, borderRadius: 9, border: 'none', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', transition: 'all .15s',
                background: view === t ? 'var(--bg2)' : 'none',
                color: view === t ? 'var(--t1)' : 'var(--t3)',
                boxShadow: view === t ? '0 1px 4px rgba(0,0,0,.3)' : 'none',
              }}>{tabLabels[t]}</button>
            ))}
          </div>
        )}

        {/* 找回密码标题 */}
        {view === 'forgot' && (
          <div style={{ marginBottom: 20 }}>
            <button onClick={() => switchView('login')} style={{
              background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer',
              fontSize: 13, padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4,
            }}>← 返回登录</button>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>找回密码</h3>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--t2)' }}>
              输入注册邮箱，我们将发送重置链接（30分钟内有效）
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
            <Field label="邮箱地址" type="email" placeholder="your@email.com"
              value={email} onChange={v => { setEmail(v); setEmailError(''); }}
              onBlur={validateEmail} error={emailError} disabled={loading} />
            <Field label="密码" type="password" placeholder="••••••••"
              value={pw} onChange={setPw} disabled={loading}
              onEnter={handleLogin} />

            <div style={{ textAlign: 'right', marginBottom: 20, marginTop: -8 }}>
              <button onClick={() => switchView('forgot')} style={{
                background: 'none', border: 'none', fontSize: 13,
                color: 'var(--t2)', cursor: 'pointer', padding: 0,
              }}>忘记密码？</button>
            </div>

            <button onClick={handleLogin} disabled={loading} style={btnPrimary}>
              {loading ? '登录中...' : '登录'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--t2)' }}>
              还没有账号？
              <button onClick={() => switchView('register')} style={{
                background: 'none', border: 'none', color: '#f0b429',
                cursor: 'pointer', fontSize: 13, padding: 0, fontWeight: 600,
              }}>免费注册 →</button>
            </div>


          </div>
        )}

        {/* ── 注册表单 ── */}
        {view === 'register' && (
          <div>
            {/* 步骤指示器 */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 22, gap: 0 }}>
              {[{ n: 1, label: '填写邮箱' }, { n: 2, label: '验证邮箱' }, { n: 3, label: '设置密码' }].map((s, i, arr) => (
                <React.Fragment key={s.n}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700,
                      background: (s.n === 1 && !codeSent) || (s.n === 2 && codeSent && !codeVerified) || (s.n === 3 && codeVerified)
                        ? '#f0b429' : (s.n < (codeVerified ? 3 : codeSent ? 2 : 1)) ? 'var(--green)' : 'var(--bg3)',
                      color: (s.n === 1 && !codeSent) || (s.n === 2 && codeSent && !codeVerified) || (s.n === 3 && codeVerified)
                        ? '#000' : 'var(--t3)',
                    }}>{s.n < (codeVerified ? 3 : codeSent ? 2 : 1) ? '✓' : s.n}</div>
                    <span style={{ fontSize: 10, color: 'var(--t3)', whiteSpace: 'nowrap' }}>{s.label}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <div style={{ flex: 1, height: 1, background: 'var(--border)', margin: '0 6px', marginBottom: 16 }} />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* 步骤1：填写邮箱 + 发验证码 */}
            {!codeSent && (
              <>
                <Field label="邮箱地址" type="email" placeholder="your@email.com"
                  value={email} onChange={v => { setEmail(v); setEmailError(''); }}
                  onBlur={validateEmail} error={emailError} disabled={sendingCode} />
                <button onClick={handleSendCode} disabled={sendingCode} style={{
                  ...btnPrimary,
                  background: sendingCode ? 'var(--bg3)' : 'linear-gradient(135deg,#f0b429,#e8920a)',
                  color: sendingCode ? 'var(--t3)' : '#000',
                }}>
                  {sendingCode ? '发送中...' : '发送验证码'}
                </button>
              </>
            )}

            {/* 步骤2：输入验证码 */}
            {codeSent && !codeVerified && (
              <>
                <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(77,159,255,0.08)', borderRadius: 8, fontSize: 13, color: 'var(--t2)' }}>
                  验证码已发送到 <strong style={{ color: 'var(--t1)' }}>{email.trim()}</strong>，请查收邮件（注意垃圾箱）
                </div>
                <Field label="邮箱验证码" type="text" placeholder="请输入6位验证码"
                  value={verifyCodeVal} onChange={v => setVerifyCodeVal(v.replace(/\D/g, '').slice(0, 6))}
                  disabled={loading} onEnter={handleVerifyCode} />
                <button onClick={handleVerifyCode} disabled={loading || verifyCodeVal.length < 6} style={{
                  ...btnPrimary,
                  opacity: loading || verifyCodeVal.length < 6 ? 0.6 : 1,
                }}>
                  {loading ? '验证中...' : '验证'}
                </button>
                <div style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: 'var(--t3)' }}>
                  没收到？
                  {codeCountdown > 0 ? (
                    <span style={{ color: 'var(--t3)' }}> {codeCountdown}s 后可重发</span>
                  ) : (
                    <button onClick={handleSendCode} disabled={sendingCode} style={{
                      background: 'none', border: 'none', color: '#f0b429', cursor: 'pointer', fontSize: 13, padding: 0,
                    }}>{sendingCode ? '发送中...' : '重新发送'}</button>
                  )}
                </div>
              </>
            )}

            {/* 步骤3：设置密码完成注册 */}
            {codeVerified && (
              <>
                <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(34,197,94,0.08)', borderRadius: 8, fontSize: 13, color: '#4ade80', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span>✓</span> 邮箱 <strong>{email.trim()}</strong> 验证通过
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 5, display: 'block' }}>设置密码</label>
                  <input
                    type="password"
                    placeholder="8位以上，含字母+数字+特殊字符"
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

                <Field label="确认密码" type="password" placeholder="再次输入密码"
                  value={pw2} onChange={setPw2} disabled={loading}
                  error={pw2 && pw !== pw2 ? '两次密码不一致' : ''}
                  onEnter={handleRegister} />

                <Field label="邀请码" hint="（选填，填写后双方均获得奖励）"
                  placeholder="例如：WYCK-7F2K" value={inviteCode}
                  onChange={v => setInviteCode(v.toUpperCase())}
                  disabled={loading} badge="选填" />

                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--t2)', lineHeight: 1.6 }}>
                    <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                      disabled={loading}
                      style={{ marginTop: 2, accentColor: '#f0b429', flexShrink: 0 }} />
                    我已阅读并同意&nbsp;
                    <a style={{ color: '#f0b429', cursor: 'pointer', textDecoration: 'none' }}>服务条款</a>
                    &nbsp;和&nbsp;
                    <a style={{ color: '#f0b429', cursor: 'pointer', textDecoration: 'none' }}>隐私政策</a>
                  </label>
                </div>

                <button onClick={handleRegister} disabled={loading} style={btnPrimary}>
                  {loading ? '创建中...' : '创建账号'}
                </button>

                <div style={{
                  marginTop: 14, padding: '10px 12px',
                  background: 'rgba(240,180,41,0.06)', border: '1px solid rgba(240,180,41,0.2)',
                  borderRadius: 10, fontSize: 12, color: 'var(--t2)', lineHeight: 1.6,
                }}>
                  🎁 注册后系统自动赠送免费额度，邀请好友注册可获得额外奖励次数
                </div>
              </>
            )}

            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: 'var(--t2)' }}>
              已有账号？
              <button onClick={() => switchView('login')} style={{
                background: 'none', border: 'none', color: '#f0b429',
                cursor: 'pointer', fontSize: 13, padding: 0, fontWeight: 600,
              }}>← 返回登录</button>
            </div>
          </div>
        )}

        {/* ── 找回密码 ── */}
        {view === 'forgot' && (
          <div>
            {!resetSent ? (
              <>
                <Field label="注册邮箱" type="email" placeholder="your@email.com"
                  value={email} onChange={v => { setEmail(v); setEmailError(''); }}
                  onBlur={validateEmail} error={emailError} disabled={loading}
                  onEnter={handleResetRequest} />

                <button onClick={handleResetRequest} disabled={loading} style={btnPrimary}>
                  {loading ? '发送中...' : '发送重置邮件'}
                </button>
              </>
            ) : (
              <div style={{
                textAlign: 'center', padding: '20px 0',
              }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
                <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 8px' }}>重置邮件已发送</p>
                <p style={{ fontSize: 13, color: 'var(--t2)', margin: '0 0 20px', lineHeight: 1.6 }}>
                  重置链接已发送到<br />
                  <strong style={{ color: 'var(--t1)' }}>{email.trim()}</strong><br />
                  请在 30 分钟内点击邮件中的链接完成重置
                </p>
                <p style={{ fontSize: 12, color: 'var(--t3)', margin: '0 0 20px' }}>
                  没收到邮件？请检查垃圾邮件文件夹，或
                  <button onClick={() => { setResetSent(false); setError(''); }} style={{
                    background: 'none', border: 'none', color: '#f0b429', cursor: 'pointer',
                    fontSize: 12, padding: 0,
                  }}>重新发送</button>
                </p>
                <button onClick={() => switchView('login')} style={{
                  ...btnPrimary, width: 'auto', padding: '10px 28px',
                }}>返回登录</button>
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
