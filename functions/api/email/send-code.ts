/**
 * 发送注册邮箱验证码（Cloudflare Pages Function）
 *
 * POST /api/email/send-code
 * Body: { email: string }
 *
 * 安全措施：
 *   - 同 IP 每小时最多发 5 次（KV 计数，无 KV 时降级放行）
 *   - 一次性邮箱域名黑名单
 *   - 验证码 6 位数字，5 分钟过期（存 Supabase email_verify_codes 表）
 *
 * CF 环境变量：
 *   RESEND_API_KEY        = re_xxxx
 *   EMAIL_FROM            = Wyckoff Pro <onboarding@resend.dev>
 *   SUPABASE_URL          = https://xxx.supabase.co
 *   SUPABASE_SERVICE_KEY  = eyJ...（service_role key，有写权限）
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

// 一次性邮箱域名黑名单
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwam.com',
  'sharklasers.com', 'guerrillamailblock.com', 'grr.la', 'guerrillamail.info',
  'yopmail.com', 'yopmail.fr', 'cool.fr.nf', 'jetable.fr.nf',
  'nospam.ze.tc', 'nomail.xl.cx', 'mega.zik.dj', 'speed.1s.fr',
  'courriel.fr.nf', 'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf',
  'trashmail.com', 'trashmail.me', 'trashmail.at', 'dispostable.com',
  'maildrop.cc', 'spamgourmet.com', 'spam4.me', '10minutemail.com',
  'fakeinbox.com', 'getairmail.com', 'filzmail.com', 'throwam.com',
]);

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (context.request.method !== 'POST') {
    return json({ error: '仅支持 POST 请求' }, 405);
  }

  const apiKey = context.env.RESEND_API_KEY;
  const supabaseUrl = context.env.SUPABASE_URL;
  const supabaseKey = context.env.SUPABASE_SERVICE_KEY;

  if (!apiKey || !supabaseUrl || !supabaseKey) {
    console.error('[send-code] 环境变量未完整配置');
    return json({ error: '服务暂时不可用，请联系管理员' }, 503);
  }

  let body: { email?: string };
  try {
    body = await context.request.json() as { email?: string };
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }

  const email = (body.email ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: '请填写合法的邮箱地址' }, 400);
  }

  // 一次性邮箱拦截
  const domain = email.split('@')[1];
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return json({ error: '不支持临时邮箱，请使用真实邮箱注册' }, 400);
  }

  // IP 限速（每小时5次）
  const ip = context.request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (context.env.RATE_LIMIT_KV) {
    const key = `vc_rate:${ip}`;
    const raw = await context.env.RATE_LIMIT_KV.get(key);
    const count = raw ? parseInt(raw) : 0;
    if (count >= 5) {
      return json({ error: '发送过于频繁，请1小时后再试' }, 429);
    }
    await context.env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: 3600 });
  }

  const code = generateCode();
  const expireAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  // 将验证码写入 Supabase（upsert，同一邮箱覆盖旧码）
  const supabaseResp = await fetch(
    `${supabaseUrl}/rest/v1/email_verify_codes`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ email, code, expire_at: expireAt }),
    },
  );

  if (!supabaseResp.ok) {
    const errText = await supabaseResp.text();
    console.error('[send-code] Supabase 写入失败:', errText);
    return json({ error: '验证码生成失败，请稍后重试' }, 502);
  }

  // 发送邮件
  const from = context.env.EMAIL_FROM ?? 'Wyckoff Pro <onboarding@resend.dev>';
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:480px;margin:40px auto;background:#161b22;border-radius:12px;overflow:hidden;border:1px solid #30363d">
    <div style="background:linear-gradient(135deg,#1a2744,#0d2137);padding:28px 40px;text-align:center">
      <div style="font-size:24px;font-weight:700;color:#4d9fff">WYCKOFF PRO</div>
    </div>
    <div style="padding:36px 40px;text-align:center">
      <h2 style="color:#e6edf3;margin:0 0 12px;font-size:20px">邮箱验证码</h2>
      <p style="color:#8b949e;margin:0 0 28px;font-size:14px">请在注册页面输入以下验证码（5分钟内有效）</p>
      <div style="background:#0d1117;border-radius:12px;padding:24px;margin-bottom:24px;border:2px solid #4d9fff">
        <div style="font-size:40px;font-weight:700;color:#4d9fff;letter-spacing:12px">${code}</div>
      </div>
      <p style="color:#484f58;font-size:12px;margin:0">如非本人操作，请忽略此邮件</p>
    </div>
  </div>
</body>
</html>`;

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
      console.error('[send-code] Resend 错误:', JSON.stringify(mailData));
      return json({ error: `邮件发送失败: ${mailData.message ?? '未知错误'}` }, 502);
    }

    console.log(`[send-code] 验证码已发送 email=${email} id=${mailData.id}`);
    return json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[send-code] fetch error:', msg);
    return json({ error: '邮件服务请求失败', detail: msg }, 502);
  }
};
