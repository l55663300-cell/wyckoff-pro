/**
 * 微信推送 - 基于 Server酱 (https://sct.ftqq.com/)
 * 用户需在 https://sct.ftqq.com/ 微信扫码登录获取 SendKey
 */

export interface WechatPushConfig {
  sendKey: string;   // Server酱 SendKey，形如 SCT_xxxxxxx
  enabled: boolean;
  minProbability: number; // 最低触发概率，默认70%
}

const CONFIG_KEY = 'wyckoff_wechat_config';

export function loadPushConfig(): WechatPushConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { sendKey: '', enabled: false, minProbability: 70 };
}

export function savePushConfig(config: WechatPushConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

/**
 * 发送微信推送
 * Server酱 API: GET https://sctapi.ftqq.com/{SendKey}.send?title=...&desp=...
 * 支持 Markdown，使用 CORS 代理绕过浏览器限制
 */
export async function sendWechatPush(
  config: WechatPushConfig,
  title: string,
  markdown: string
): Promise<{ ok: boolean; msg: string }> {
  if (!config.sendKey || !config.enabled) {
    return { ok: false, msg: '推送未启用或 SendKey 为空' };
  }

  const key = config.sendKey.trim();
  // Server酱 Turbo API endpoint
  const endpoint = `https://sctapi.ftqq.com/${key}.send`;

  try {
    const params = new URLSearchParams({
      title: title,
      desp: markdown,
    });

    const res = await fetch(`${endpoint}?${params.toString()}`, {
      method: 'GET',
    });

    if (!res.ok) {
      return { ok: false, msg: `HTTP ${res.status}` };
    }

    const data = await res.json();
    if (data.code === 0) {
      return { ok: true, msg: '推送成功' };
    } else {
      return { ok: false, msg: data.message || '推送失败' };
    }
  } catch (err: any) {
    return { ok: false, msg: err?.message || '网络错误' };
  }
}

/**
 * 构建入场信号推送消息（Markdown格式）
 */
export function buildEntryAlertMessage(
  symbol: string,
  price: number,
  direction: 'long' | 'short',
  probability: number,
  phase: string,
  pattern: string,
  entryLow: number,
  entryHigh: number,
  stopLoss: number,
  target1: number,
  target2: number,
  target3: number,
  riskReward: number,
  positionSize: number,
  compositeMan: string,
  fearGreed: number,
  fearGreedLabel: string,
): { title: string; body: string } {
  const dir = direction === 'long' ? '📈 做多' : '📉 做空';
  const phaseLabel: Record<string, string> = {
    accumulation: '吸筹区', markup: '上涨趋势', distribution: '派发区', markdown: '下跌趋势',
  };
  const patternLabel: Record<string, string> = {
    spring: '弹簧效应(Spring)', upthrust: '假突破(UpThrust)', sos: '力量迹象(SOS)', sow: '弱势迹象(SOW)', none: '无明显形态',
  };
  const fmt = (n: number) => symbol === 'BTCUSDT' ? n.toFixed(0) : n.toFixed(2);

  const title = `🦞 威科夫Pro · ${symbol} 入场信号 | ${dir} | 概率${probability}%`;

  const body = `## 🦞 威科夫Pro · 入场信号

> **${symbol}** · ${new Date().toLocaleString('zh-CN')}

---

### 📊 市场状态
| 项目 | 数值 |
|------|------|
| 当前价格 | **$${fmt(price)}** |
| 威科夫阶段 | ${phaseLabel[phase] || phase} |
| 识别形态 | ${patternLabel[pattern] || pattern} |
| 恐贪指数 | ${fearGreed}（${fearGreedLabel}） |

---

### 🎯 交易计划 — ${dir}（概率 **${probability}%**）

- **入场区间**：$${fmt(entryLow)} — $${fmt(entryHigh)}
- **止损价位**：$${fmt(stopLoss)}（ATR×2动态止损）

**分批止盈**：
- ✅ 保守止盈（50%仓）@ **$${fmt(target1)}**（1.272扩展位）
- ✨ 理想止盈（30%仓）@ **$${fmt(target2)}**（1.618扩展位）
- 🎯 激进止盈（20%仓）@ **$${fmt(target3)}**（移动跟踪）

---

### 📐 风控参数
- 建议仓位：**${positionSize}%**（30x杠杆）
- 盈亏比：**${riskReward.toFixed(2)}**
- 时间止损：入场后 **16小时** 未脱离成本区→平仓

---

### ⚡ 复合人动向
${compositeMan}

---

_数据驱动，逻辑为王 🦞 · 威科夫Pro_`;

  return { title, body };
}
