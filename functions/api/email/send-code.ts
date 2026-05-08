/**
 * 发送注册邮箱验证码（Cloudflare Pages Function）
 * POST /api/email/send-code
 * Body: { email: string }
 */

interface Env {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
  RATE_LIMIT_KV?: KVNamespace;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com',
  'yopmail.com', 'trashmail.com', 'maildrop.cc', '10minutemail.com',
  'fakeinbox.com', 'getairmail.com', 'throwam.com', 'dispostable.com',
]);

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return json({ error: '仅支持 POST 请求' }, 405);
  }

  const apiKey = env.RESEND_API_KEY;
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY;

  if (!apiKey || !supabaseUrl || !supabaseKey) {
    const missing = [
      !apiKey && 'RESEND_API_KEY',
      !supabaseUrl && 'SUPABASE_URL',
      !supabaseKey && 'SUPABASE_SERVICE_KEY',
    ].filter(Boolean).join(', ');
    return json({ error: `服务暂时不可用，缺少环境变量: ${missing}` }, 503);
  }

  let body: { email?: string };
  try {
    body = await request.json() as { email?: string };
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }

  const email = (body.email ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: '请填写合法的邮箱地址' }, 400);
  }

  const domain = email.split('@')[1];
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return json({ error: '不支持临时邮箱，请使用真实邮箱注册' }, 400);
  }

  // IP 限速（每小时5次）
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (env.RATE_LIMIT_KV) {
    const key = `vc_rate:${ip}`;
    const raw = await env.RATE_LIMIT_KV.get(key);
    const count = raw ? parseInt(raw) : 0;
    if (count >= 5) {
      return json({ error: '发送过于频繁，请1小时后再试' }, 429);
    }
    await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: 3600 });
  }

  const code = generateCode();
  const expireAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  // 先删除同邮箱旧验证码
  await fetch(
    `${supabaseUrl}/rest/v1/email_verify_codes?email=eq.${encodeURIComponent(email)}`,
    {
      method: 'DELETE',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    },
  );

  // 写入新验证码
  const supabaseResp = await fetch(
    `${supabaseUrl}/rest/v1/email_verify_codes`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ email, code, expires_at: expireAt }),
    },
  );

  if (!supabaseResp.ok) {
    const errText = await supabaseResp.text();
    return json({ error: `Supabase写入失败(${supabaseResp.status}): ${errText}` }, 502);
  }

  // 发送邮件
  const from = env.EMAIL_FROM ?? 'Wyckoff Pro <onboarding@resend.dev>';
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:Arial,sans-serif">
  <div style="max-width:480px;margin:40px auto;background:#161b22;border-radius:12px;border:1px solid #30363d">
    <div style="background:linear-gradient(135deg,#1a2744,#0d2137);padding:28px 40px;text-align:center;border-radius:12px 12px 0 0">
      <div style="font-size:24px;font-weight:700;color:#4d9fff">WYCKOFF PRO</div>
    </div>
    <div style="padding:36px 40px;text-align:center">
      <h2 style="color:#e6edf3;margin:0 0 12px">邮箱验证码</h2>
      <p style="color:#8b949e;margin:0 0 28px;font-size:14px">请在注册页面输入以下验证码（5分钟内有效）</p>
      <div style="background:#0d1117;border-radius:12px;padding:24px;margin-bottom:24px;border:2px solid #4d9fff">
        <div style="font-size:40px;font-weight:700;color:#4d9fff;letter-spacing:12px">${code}</div>
      </div>
      <p style="color:#484f58;font-size:12px;margin:0">如非本人操作，请忽略此邮件</p>
    </div>
  </div>
</body></html>`;

  try {
    const mailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: `【Wyckoff Pro】您的验证码是 ${code}`,
        html,
      }),
    });

    const mailData = await mailResp.json() as { id?: string; message?: string };
    if (!mailResp.ok) {
      return json({ error: `邮件发送失败: ${mailData.message ?? '未知错误'}` }, 502);
    }

    return json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: '邮件服务请求失败', detail: msg }, 502);
  }
};
