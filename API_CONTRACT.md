# WyckoffPro API 接口契约文档

> 本文档定义前端与后端（及第三方代理）之间的数据格式约定。  
> 未来对接真实后端时，所有接口的字段名、类型、时间格式必须与本文档保持一致。

---

## 一、K线数据（KLine）

### 来源
Binance / OKX / Gate → Cloudflare Pages Function 代理 → 前端

### TypeScript 类型（`src/types/index.ts`）
```ts
interface KLine {
  openTime:  number;   // 开盘时间，Unix 毫秒时间戳（13位）
  open:      number;   // 开盘价
  high:      number;   // 最高价
  low:       number;   // 最低价
  close:     number;   // 收盘价
  volume:    number;   // 成交量（base currency）
  closeTime: number;   // 收盘时间，Unix 毫秒时间戳（13位）
}
```

### 约束
- 所有价格字段为 `number`（不是字符串），通过 `parseFloat` 转换
- `openTime` 必须 > `1262304000000`（2010-01-01）
- `high >= low`，`high >= open/close`，`low <= open/close`
- `volume >= 0`
- 数组长度不少于 50 根（分析入口处校验）

---

## 二、认证接口（Auth）

### 当前状态
**Mock 实现**（`src/api/auth.ts`），数据存于前端内存，刷新丢失。  
上线时替换为真实后端 HTTP 请求，接口格式保持不变。

### 登录 POST /auth/login
**请求**
```json
{
  "email": "user@example.com",
  "password": "Password@123"
}
```
**成功响应 200**
```json
{
  "uid": "u_1234567890",
  "email": "user@example.com",
  "name": "user",
  "credits": 5,
  "inviteCode": "WYCK-AB12",
  "isAdmin": false,
  "token": "eyJhbGci..."
}
```
**失败响应 401/429**
```json
{ "message": "邮箱或密码错误", "code": 401 }
```

### 注册 POST /auth/register
**请求**
```json
{
  "email": "user@example.com",
  "password": "Password@123",
  "agree": true,
  "inviteCode": "WYCK-ADMIN"  // 选填
}
```
**成功响应 200**（在登录响应基础上多一个字段）
```json
{
  "uid": "...",
  "email": "...",
  "name": "...",
  "credits": 5,
  "inviteCode": "WYCK-XX99",
  "isAdmin": false,
  "token": "...",
  "welcomeCredits": 5
}
```

### 密码强度规则
正则：`/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/`  
要求：8位以上，同时包含字母、数字、特殊字符

---

## 三、LLM 代理接口

### 开发环境
前端直接调用 LLM Provider API（Key 存于 localStorage）。

### 生产环境（Cloudflare Pages Function）
**POST /api/llm**

**请求**
```json
{
  "messages": [
    { "role": "system", "content": "你是..." },
    { "role": "user",   "content": "分析..." }
  ],
  "provider": "deepseek",   // 仅用于日志，不影响路由
  "model": "deepseek-chat", // 可选，覆盖环境变量
  "max_tokens": 2000,       // 可选
  "temperature": 0.3        // 可选
}
```

**成功响应 200**（OpenAI 格式透传）
```json
{
  "choices": [
    { "message": { "role": "assistant", "content": "分析结果..." } }
  ],
  "model": "deepseek-chat",
  "usage": { "prompt_tokens": 500, "completion_tokens": 800 }
}
```

**失败响应**
```json
{ "error": "LLM 代理请求失败", "detail": "..." }
```

### 环境变量（Cloudflare Dashboard 配置）
| 变量名 | 说明 | 示例 |
|---|---|---|
| `LLM_API_KEY` | LLM 服务 API Key（必须） | `sk-xxxx` |
| `LLM_BASE_URL` | OpenAI 兼容接口地址 | `https://api.deepseek.com/v1` |
| `LLM_MODEL` | 默认模型 | `deepseek-chat` |
| `LLM_MAX_TOKENS` | 最大输出 token | `2000` |

---

## 四、数据代理接口（行情）

所有行情接口通过 Cloudflare Pages Function 代理，前端无需关心跨域。

| 前端路径 | 代理目标 | Function 文件 |
|---|---|---|
| `/api/binance/*` | `https://api.binance.com` | `functions/api/binance/[[path]].ts` |
| `/api/fapi/*` | `https://fapi.binance.com` | `functions/api/fapi/[[path]].ts` |
| `/api/okx/*` | `https://www.okx.com` | `functions/api/okx/[[path]].ts` |
| `/api/gate/*` | `https://api.gateio.ws` | `functions/api/gate/[[path]].ts` |
| `/api/fng/*` | `https://api.alternative.me` | `functions/api/fng/[[path]].ts` |
| `/api/allorigins/*` | `https://api.allorigins.win` | `functions/api/allorigins/[[path]].ts` |

代理层错误处理：上游超时/异常时返回 `502`，格式：
```json
{ "error": "XXX 代理请求失败", "detail": "..." }
```

---

## 五、分析结果（AnalysisResult）

### TypeScript 类型（`src/types/index.ts`）
完整类型见源码，关键字段：
```ts
interface AnalysisResult {
  symbol: string;              // 交易对，如 "BTCUSDT"
  timeframe: Timeframe;        // "1d" | "4h" | "1h" | "15m"
  wyckoffPhase: WyckoffPhase;  // 当前威科夫阶段
  trend: 'bullish' | 'bearish' | 'neutral';
  entryZone: { low: number; high: number };
  stopLoss: number;
  targets: number[];
  riskReward: number;
  confidence: number;          // 0-100
  analysisTime: string;        // ISO 8601，如 "2026-05-01T14:30:00.000Z"
}
```

---

## 六、HTTPS & 安全

- **开发环境**：HTTP localhost:5173（Vite dev server）
- **生产环境**：Cloudflare Pages 自动 HTTPS + HSTS
- **安全响应头**（`vercel.json` / CF Pages `_headers`）：
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
