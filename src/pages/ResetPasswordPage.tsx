import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../components/Toast';
import { apiResetConfirm, checkPasswordStrength, PASSWORD_RE, type ApiError } from '../api/auth';
import { useT } from '../i18n';

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
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: score > 0 ? colors[score - 1] : 'var(--t3)' }}>
          {score > 0 ? labels[score - 1] : ''}
        </span>
        {tips.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>{t.auth.pwStrengthMore}{tips.join('、')}</span>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  const { navigate } = useApp();
  const { showToast } = useToast();
  const t = useT();

  const [token, setToken] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = params.get('reset_token') || sessionStorage.getItem('pending_reset_token') || '';
    setToken(tok);
    if (tok) sessionStorage.removeItem('pending_reset_token');
  }, []);

  const handleSubmit = async () => {
    setError('');
    if (!token) { setError(t.reset.invalidToken); return; }
    if (!PASSWORD_RE.test(pw)) {
      setError(t.reset.weakPassword);
      return;
    }
    if (pw !== pw2) { setError(t.auth.confirmPasswordError); return; }

    setLoading(true);
    try {
      await apiResetConfirm(token, pw);
      setDone(true);
      showToast(t.reset.successToast, 'success');
    } catch (e) {
      setError((e as ApiError).message ?? t.reset.weakPassword);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: 9, boxSizing: 'border-box',
    background: 'var(--bg3)', border: '1px solid var(--border)',
    color: 'var(--t1)', fontSize: 14, outline: 'none',
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg1)', padding: 20,
    }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20,
        padding: '40px', width: 420, maxWidth: '100%',
        boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
          <span style={{ fontSize: 26 }}>🦞</span>
          <span style={{ fontWeight: 700, fontSize: 17 }}>{t.reset.brandName}</span>
        </div>

        {!done ? (
          <>
            <h2 style={{ margin: '0 0 6px', fontSize: 20 }}>{t.reset.title}</h2>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--t2)' }}>{t.reset.subtitle}</p>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8, padding: '9px 13px', fontSize: 13, color: '#f87171',
                marginBottom: 16, display: 'flex', gap: 6,
              }}>
                <span>⚠</span><span>{error}</span>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 5, display: 'block' }}>{t.reset.newPasswordLabel}</label>
              <input type="password" placeholder={t.reset.newPasswordPlaceholder}
                value={pw} onChange={e => setPw(e.target.value)} disabled={loading}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = '#f0b429')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              <PasswordStrengthBar password={pw} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 5, display: 'block' }}>{t.reset.confirmLabel}</label>
              <input type="password" placeholder={t.reset.confirmPlaceholder}
                value={pw2} onChange={e => setPw2(e.target.value)} disabled={loading}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                style={{
                  ...inputStyle,
                  borderColor: pw2 && pw !== pw2 ? 'rgba(239,68,68,0.6)' : 'var(--border)',
                }}
                onFocus={e => (e.target.style.borderColor = '#f0b429')}
                onBlur={e => (e.target.style.borderColor = pw2 && pw !== pw2 ? 'rgba(239,68,68,0.6)' : 'var(--border)')} />
              {pw2 && pw !== pw2 && (
                <p style={{ fontSize: 11, color: '#f87171', marginTop: 3 }}>{t.reset.confirmError}</p>
              )}
            </div>

            <button onClick={handleSubmit} disabled={loading} style={{
              width: '100%', padding: 12, borderRadius: 10, border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(135deg, #f0b429, #e8920a)',
              color: '#000', fontWeight: 700, fontSize: 15,
              opacity: loading ? 0.7 : 1,
            }}>
              {loading ? t.reset.submittingBtn : t.reset.submitBtn}
            </button>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>{t.reset.doneTitle}</h3>
            <p style={{ fontSize: 13, color: 'var(--t2)', margin: '0 0 24px' }}>
              {t.reset.doneDesc}
            </p>
            <button onClick={() => navigate('landing')} style={{
              padding: '11px 32px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #f0b429, #e8920a)',
              color: '#000', fontWeight: 700, fontSize: 14,
            }}>{t.reset.backHome}</button>
          </div>
        )}
      </div>
    </div>
  );
}
