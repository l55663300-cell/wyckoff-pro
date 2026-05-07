/**
 * 邮件发送 Function（Cloudflare Pages Function）
 *
 * 支持的邮件类型：
 *   - welcome：注册欢迎邮件
 *   - reset：密码重置邮件（备用，Supabase 已内置）
 *   - verify_code：注册邮箱验证码（第四步使用）
 *
 * CF 环境变量（Dashboard → Pages → Settings → Environment variables）：
 *   RESEND_API_KEY = re_xxxx
 *   EMAIL_FROM     = noreply@yourdomain.com（可选，默认 onboarding@resend.dev）
 *
 * 请求格式：POST /api/email/send
 * Body: { type: 'welcome'|'reset'|'verify_code', to: string, ...extra }
 */

interface Env {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

interface SendRequest {
  type: 'welcome' | 'reset' | 'verify_code';
  to: string;
  name?: string;
  code?: string;
  resetLink?: string;
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

// ─── 邮件模板 ─────────────────────────────────────────────────────────────────

function welcomeHtml(name: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#161b22;border-radius:12px;overflow:hidden;border:1px solid #30363d">
    <div style="background:linear-gradient(135deg,#1a2744,#0d2137);padding:32px 40px;text-align:center">
      <div style="font-size:28px;font-weight:700;color:#4d9fff;letter-spacing:1px">WYCKOFF PRO</div>
      <div style="color:#8b949e;font-size:13px;margin-top:6px">专业加密货币分析平台</div>
    </div>
    <div style="padding:36px 40px">
      <h2 style="color:#e6edf3;margin:0 0 16px;font-size:20px">欢迎加入，${name}！🎉</h2>
      <p style="color:#8b949e;line-height:1.7;margin:0 0 24px">
        感谢您注册 Wyckoff Pro。您已获得 <strong style="color:#4d9fff">7天免费专业版试用</strong>，
        包含每日30次 AI 分析、全币种行情图表和威科夫结构分析。
      </p>
      <div style="background:#0d1117;border-radius:8px;padding:20px 24px;margin-bottom:24px;border-left:3px solid #4d9fff">
        <div style="color:#8b949e;font-size:13px;margin-bottom:8px">您的试用权益</div>
        <div style="color:#e6edf3;font-size:14px;line-height:2">
          ✅ 每日 30 次 AI 行情分析<br>
          ✅ 500+ 币种 K 线图表<br>
          ✅ 威科夫结构 + 资金流向分析<br>
          ✅ 恐惧贪婪指数实时监控
        </div>
      </div>
      <a href="https://wkfpro.com" style="display:inline-block;background:#4d9fff;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600">
        立即开始分析 →
      </a>
    </div>
    <div style="padding:20px 40px;border-top:1px solid #30363d;text-align:center">
      <p style="color:#484f58;font-size:12px;margin:0">
        如有问题请回复此邮件 · <a href="https://wkfpro.com" style="color:#4d9fff;text-decoration:none">wkfpro.com</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function verifyCodeHtml(code: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
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
}

function resetHtml(resetLink: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:480px;margin:40px auto;background:#161b22;border-radius:12px;overflow:hidden;border:1px solid #30363d">
    <div style="background:linear-gradient(135deg,#1a2744,#0d2137);padding:28px 40px;text-align:center">
      <div style="font-size:24px;font-weight:700;color:#4d9fff">WYCKOFF PRO</div>
    </div>
    <div style="padding:36px 40px">
      <h2 style="color:#e6edf3;margin:0 0 16px;font-size:20px">重置密码</h2>
      <p style="color:#8b949e;line-height:1.7;margin:0 0 28px">点击下方按钮设置新密码，链接30分钟内有效。</p>
      <a href="${resetLink}" style="display:inline-block;background:#4d9fff;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600">
        重置密码 →
      </a>
      <p style="color:#484f58;font-size:12px;margin:24px 0 0">如非本人操作，请忽略此邮件</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── 主处理器 ─────────────────────────────────────────────────────────────────

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (context.request.method !== 'POST') {
    return json({ error: '仅支持 POST 请求' }, 405);
  }

  const apiKey = context.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[email] RESEND_API_KEY 未配置');
    return json({ error: '邮件服务未配置' }, 503);
  }

  const from = context.env.EMAIL_FROM ?? 'Wyckoff Pro <onboarding@resend.dev>';

  let body: SendRequest;
  try {
    body = await context.request.json() as SendRequest;
  } catch {
    return json({ error: '请求体格式错误' }, 400);
  }

  const { type, to } = body;
  if (!type || !to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return json({ error: 'type 和合法的 to 邮箱必填' }, 400);
  }

  let subject = '';
  let html = '';

  switch (type) {
    case 'welcome': {
      const name = body.name ?? to.split('@')[0];
      subject = '🎉 欢迎加入 Wyckoff Pro — 您的7天免费试用已开启';
      html = welcomeHtml(name);
      break;
    }
    case 'verify_code': {
      if (!body.code) return json({ error: 'verify_code 类型需要 code 字段' }, 400);
      subject = `【Wyckoff Pro】您的验证码是 ${body.code}`;
      html = verifyCodeHtml(body.code);
      break;
    }
    case 'reset': {
      if (!body.resetLink) return json({ error: 'reset 类型需要 resetLink 字段' }, 400);
      subject = '【Wyckoff Pro】密码重置链接';
      html = resetHtml(body.resetLink);
      break;
    }
    default:
      return json({ error: '不支持的邮件类型' }, 400);
  }

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    const data = await resp.json() as { id?: string; name?: string; message?: string };
    console.log(`[email] type=${type} to=${to} status=${resp.status} id=${data.id ?? '-'}`);

    if (!resp.ok) {
      console.error(`[email] Resend error: ${JSON.stringify(data)}`);
      return json({ error: `邮件发送失败: ${data.message ?? data.name ?? '未知错误'}` }, 502);
    }

    return json({ ok: true, id: data.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[email] fetch error: ${msg}`);
    return json({ error: '邮件服务请求失败', detail: msg }, 502);
  }
};
