/**
 * 发送注册邮箱验证码（Cloudflare Pages Function）
 * POST /api/email/send-otp
 * Body: { email: string }
 */

interface Env {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com',
  'yopmail.com', 'trashmail.com', 'maildrop.cc', '10minutemail.com',
]);

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  // DIAGNOSTIC: return immediately to test if Worker boots
  return json({ boot: true, method: request.method, envKeys: Object.keys(env) }, 200);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: '仅支持 POST' }, 405);

  const { RESEND_API_KEY: apiKey, SUPABASE_URL: sbUrl, SUPABASE_SERVICE_KEY: sbKey } = env;

  if (!apiKey || !sbUrl || !sbKey) {
    const missing = [!apiKey && 'RESEND_API_KEY', !sbUrl && 'SUPABASE_URL', !sbKey && 'SUPABASE_SERVICE_KEY'].filter(Boolean).join(', ');
    return json({ error: `缺少环境变量: ${missing}` }, 503);
  }

  let email: string;
  try {
    const b = await request.json() as { email?: string };
    email = (b.email ?? '').trim().toLowerCase();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: '邮箱格式不正确' }, 400);
  }
  if (DISPOSABLE.has(email.split('@')[1])) {
    return json({ error: '不支持临时邮箱' }, 400);
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expireAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  await fetch(`${sbUrl}/rest/v1/email_verify_codes?email=eq.${encodeURIComponent(email)}`, {
    method: 'DELETE',
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
  });

  const r = await fetch(`${sbUrl}/rest/v1/email_verify_codes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: sbKey, Authorization: `Bearer ${sbKey}`, Prefer: 'return=minimal' },
    body: JSON.stringify({ email, code, expires_at: expireAt }),
  });

  if (!r.ok) {
    const t = await r.text();
    return json({ error: `DB写入失败(${r.status}): ${t}` }, 502);
  }

  const from = env.EMAIL_FROM ?? 'Wyckoff Pro <onboarding@resend.dev>';
  const mr = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from, to: email,
      subject: `【Wyckoff Pro】验证码 ${code}`,
      html: `<div style="font-family:Arial;background:#0d1117;padding:40px;text-align:center"><div style="background:#161b22;border-radius:12px;padding:40px;border:1px solid #30363d;max-width:400px;margin:auto"><h2 style="color:#4d9fff">WYCKOFF PRO</h2><p style="color:#8b949e">您的验证码（5分钟有效）</p><div style="font-size:42px;font-weight:bold;color:#4d9fff;letter-spacing:10px;margin:24px 0">${code}</div><p style="color:#484f58;font-size:12px">如非本人操作请忽略</p></div></div>`,
    }),
  });

  const md = await mr.json() as { id?: string; message?: string };
  if (!mr.ok) return json({ error: `邮件发送失败: ${md.message ?? '未知'}` }, 502);

  return json({ ok: true });
};
