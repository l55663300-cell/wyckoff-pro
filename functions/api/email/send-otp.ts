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
  'example.com', 'test.com', 'localhost',
]);

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: '仅支持 POST' }, 405);

  const { RESEND_API_KEY: apiKey, SUPABASE_URL: sbUrl, SUPABASE_SERVICE_KEY: sbKey } = env;

  if (!apiKey || !sbUrl || !sbKey) {
    const missing = [
      !apiKey && 'RESEND_API_KEY',
      !sbUrl && 'SUPABASE_URL',
      !sbKey && 'SUPABASE_SERVICE_KEY',
    ].filter(Boolean).join(', ');
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
    return json({ error: '不支持该邮箱域名，请使用真实邮箱' }, 400);
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expireAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  // 删除旧验证码（忽略失败）
  try {
    await fetch(`${sbUrl}/rest/v1/email_verify_codes?email=eq.${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
    });
  } catch {
    // 忽略
  }

  // 写入新验证码
  let r: Response;
  try {
    r = await fetch(`${sbUrl}/rest/v1/email_verify_codes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ email, code, expires_at: expireAt }),
    });
  } catch (err) {
    return json({ error: `Supabase连接失败: ${String(err)}` }, 503);
  }

  if (!r.ok) {
    const t = await r.text();
    return json({ error: `DB写入失败(${r.status}): ${t}` }, 503);
  }

  // 发送邮件
  const from = env.EMAIL_FROM ?? 'Wyckoff Pro <onboarding@resend.dev>';
  let mr: Response;
  try {
    mr = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: `【Wyckoff Pro】验证码 ${code}`,
        html: `<div style="font-family:Arial;background:#0d1117;padding:40px;text-align:center"><div style="background:#161b22;border-radius:12px;padding:40px;border:1px solid #30363d;max-width:400px;margin:auto"><h2 style="color:#4d9fff">WYCKOFF PRO</h2><p style="color:#8b949e">您的验证码（5分钟有效）</p><div style="font-size:42px;font-weight:bold;color:#4d9fff;letter-spacing:10px;margin:24px 0">${code}</div><p style="color:#484f58;font-size:12px">如非本人操作请忽略</p></div></div>`,
      }),
    });
  } catch (err) {
    return json({ error: `邮件服务连接失败: ${String(err)}` }, 503);
  }

  let md: { id?: string; message?: string; name?: string };
  try {
    md = await mr.json() as { id?: string; message?: string; name?: string };
  } catch {
    md = {};
  }

  if (!mr.ok) return json({ error: `邮件发送失败: ${md.message ?? md.name ?? '未知'}` }, 503);

  return json({ ok: true });
};
