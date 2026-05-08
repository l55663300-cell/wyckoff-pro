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

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: '仅支持 POST' }, 405);

  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return json({ error: '缺少 RESEND_API_KEY' }, 503);

  let email: string;
  try {
    const b = await request.json() as { email?: string };
    email = (b.email ?? '').trim().toLowerCase();
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }

  if (!email) return json({ error: '邮箱不能为空' }, 400);

  const code = String(Math.floor(100000 + Math.random() * 900000));

  // 只测 Resend，不碰 Supabase
  let mr: Response;
  try {
    mr = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'Wyckoff Pro <onboarding@resend.dev>',
        to: email,
        subject: `【Wyckoff Pro】验证码 ${code}`,
        html: `<p>验证码：<strong>${code}</strong>（5分钟有效）</p>`,
      }),
    });
  } catch (err) {
    return json({ error: 'resend-fetch-failed', detail: String(err) }, 503);
  }

  const md = await mr.json() as { id?: string; message?: string; name?: string };
  if (!mr.ok) return json({ error: `邮件发送失败`, detail: md }, 502);

  return json({ ok: true, id: md.id });
};
