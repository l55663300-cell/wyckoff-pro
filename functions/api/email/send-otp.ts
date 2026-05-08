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
    return json({ error: '不支持临时邮箱' }, 400);
  }

  // STEP 1: stop here, return debug info
  return json({ step: 1, email, apiKey: apiKey.slice(0, 8) + '...', sbUrl });
};
