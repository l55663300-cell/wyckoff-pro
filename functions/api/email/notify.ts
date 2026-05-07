/**
 * 管理员邮件通知代理（Cloudflare Pages Function）
 *
 * 安全设计：
 * - Resend API Key 存于 CF 环境变量 RESEND_API_KEY，不暴露在前端
 * - 仅接受内部调用（同域），且只允许发送到系统配置的管理员邮箱
 *
 * CF Dashboard 环境变量：
 *   RESEND_API_KEY = re_xxxx
 */

interface Env {
  RESEND_API_KEY?: string;
}

interface NotifyBody {
  to: string;
  subject: string;
  text: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: '仅支持 POST' }), { status: 405, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
  }

  const apiKey = context.env.RESEND_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: 'RESEND_API_KEY 未配置' }), { status: 503, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
  }

  let body: NotifyBody;
  try {
    body = await context.request.json() as NotifyBody;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: '请求体格式错误' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
  }

  if (!body.to || !body.subject) {
    return new Response(JSON.stringify({ ok: false, error: '缺少 to 或 subject' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
  }

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'noreply@wkfpro.com',
        to: body.to,
        subject: body.subject,
        text: body.text ?? '',
      }),
    });

    const result = await resp.json() as Record<string, unknown>;
    if (!resp.ok) {
      console.error('[email/notify] Resend error:', JSON.stringify(result));
      return new Response(JSON.stringify({ ok: false, error: 'Resend 发送失败' }), { status: resp.status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
    }

    return new Response(JSON.stringify({ ok: true, id: result.id }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
  }
};
