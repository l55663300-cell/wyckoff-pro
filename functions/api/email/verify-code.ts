/**
 * 校验注册邮箱验证码（Cloudflare Pages Function）
 *
 * POST /api/email/verify-code
 * Body: { email: string; code: string }
 * Response: { ok: true } | { error: string }
 *
 * CF 环境变量：
 *   SUPABASE_URL         = https://xxx.supabase.co
 *   SUPABASE_SERVICE_KEY = eyJ...（service_role key）
 */

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
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

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (context.request.method !== 'POST') {
    return json({ error: '仅支持 POST 请求' }, 405);
  }

  const supabaseUrl = context.env.SUPABASE_URL;
  const supabaseKey = context.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return json({ error: '服务暂时不可用' }, 503);
  }

  let body: { email?: string; code?: string };
  try {
    body = await context.request.json() as { email?: string; code?: string };
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const code = (body.code ?? '').trim();
  if (!email || !code) {
    return json({ error: 'email 和 code 必填' }, 400);
  }

  // 查询验证码
  const queryResp = await fetch(
    `${supabaseUrl}/rest/v1/email_verify_codes?email=eq.${encodeURIComponent(email)}&select=code,expires_at`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    },
  );

  if (!queryResp.ok) {
    return json({ error: '验证码查询失败，请重新发送' }, 502);
  }

  const rows = await queryResp.json() as Array<{ code: string; expires_at: string }>;
  if (!rows.length) {
    return json({ error: '验证码不存在或已过期，请重新发送' }, 400);
  }

  const row = rows[0];
  if (new Date(row.expires_at) < new Date()) {
    return json({ error: '验证码已过期，请重新发送' }, 400);
  }

  if (row.code !== code) {
    return json({ error: '验证码错误，请重新输入' }, 400);
  }

  // 校验通过，删除验证码（防止重复使用）
  await fetch(
    `${supabaseUrl}/rest/v1/email_verify_codes?email=eq.${encodeURIComponent(email)}`,
    {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    },
  );

  console.log(`[verify-code] 验证通过 email=${email}`);
  return json({ ok: true });
};
