# Wyckoff Pro — 项目现状文档

> 最后更新：2026-05-14  
> 版本：基于 git commit `b26e388`

---

## 一、项目概览

Wyckoff Pro 是一款面向加密货币交易者的 **AI 量化分析 SaaS Web App**，核心功能是：

- 实时拉取多周期 K 线数据（Binance / Gate / OKX）
- 本地运行威科夫理论分析 + 多维技术指标
- 调用 LLM（DeepSeek/GPT/Claude）生成 AI 深度策略报告
- 支持 PC 双栏布局 + 移动端全屏 Tab 布局

**技术栈：**
- 前端：React 18 + TypeScript 5.6 + Vite 5 + Tailwind CSS 3
- 图表：lightweight-charts 5.1 + Recharts 3
- 后端/API：Cloudflare Pages Functions（Edge Worker）
- 数据库/认证：Supabase（PostgreSQL + Auth）
- 部署：Cloudflare Pages，连接 GitHub main 分支自动构建

---

## 二、目录结构

```
wyckoff-pro/
├── src/
│   ├── api/                  # 外部 API 调用层
│   │   ├── aiAnalysis.ts     # LLM AI报告生成（Prompt构建+解析+价格方向校验）
│   │   ├── auth.ts           # Supabase 认证封装
│   │   ├── binanceApi.ts     # Binance REST（K线/资金费率/Ticker）
│   │   ├── fearGreedApi.ts   # 恐贪指数 API
│   │   ├── llmProvider.ts    # LLM 统一调用层（支持多模型）
│   │   ├── newsApi.ts        # 新闻拉取（含中文翻译）
│   │   ├── orderBookApi.ts   # 订单簿数据
│   │   ├── socialApi.ts      # 社交热度分析
│   │   └── trendingApi.ts    # 热门币种趋势
│   ├── calc/                 # 本地量化计算引擎
│   │   ├── fibonacci.ts      # 斐波那契回撤/延伸计算
│   │   ├── indicators.ts     # RSI/MACD/布林带/ADX/ATR
│   │   ├── reportGenerator.ts# 本地策略简报文本生成
│   │   ├── riskControl.ts    # 动态风控（入场区/止损/目标位/仓位）
│   │   ├── scoring.ts        # 5维度评分引擎（见§五）
│   │   ├── volumeProfile.ts  # Volume Profile / POC 计算
│   │   └── wyckoff.ts        # 威科夫阶段+形态识别
│   ├── components/
│   │   ├── chart/            # CandlestickChart、VolumeProfileBar
│   │   ├── indicators/       # IndicatorPanel（技术指标面板）
│   │   ├── layout/           # 主布局组件（见§三）
│   │   ├── modals/           # CreditsModal、NotifPanel、AvatarDropdown
│   │   ├── news/             # 新闻列表组件
│   │   ├── report/           # ReportPanel、WinRatePanel
│   │   ├── wyckoff/          # VSASignalPanel（量价信号）
│   │   ├── EmptyState.tsx    # 空状态占位
│   │   ├── LoadingOverlay.tsx# 分析加载遮罩（16步进度）
│   │   ├── RefreshCountdown.tsx
│   │   ├── Toast.tsx         # 全局消息提示
│   │   └── WechatAlertModal.tsx
│   ├── context/
│   │   └── AppContext.tsx    # 全局状态（user/quota/navigate）
│   ├── hooks/
│   │   ├── useAnalysis.ts    # 分析流程主 Hook（含缓存/冷却/16步加载）
│   │   ├── useCountdown.ts
│   │   └── useMediaQuery.ts  # 移动端检测
│   ├── i18n/                 # 中英文国际化
│   ├── lib/                  # 工具库
│   ├── pages/
│   │   └── AppPage.tsx       # 主页面（~1500行，PC/移动端自适应）
│   ├── types/
│   │   └── index.ts          # 全局类型定义
│   └── utils/                # 格式化/持久化/推送等工具（13个文件）
├── functions/
│   └── api/                  # Cloudflare Pages Functions（Edge API代理）
│       ├── allorigins/       # CORS代理
│       ├── binance/          # Binance K线代理
│       ├── email/            # OTP邮件发送（Resend）
│       ├── fapi/             # Binance Futures API代理
│       ├── fng/              # 恐贪指数代理
│       ├── gate/             # Gate.io代理
│       ├── llm/              # LLM代理（Key不出浏览器，从env读取）
│       ├── nowpayments/      # 加密支付回调
│       ├── okx/              # OKX代理
│       └── ping.ts           # 健康检查
└── package.json
```

---

## 三、主要组件说明（layout/）

| 组件 | 功能 |
|------|------|
| `RightPanel.tsx` | 右侧面板容器，集成 AI报告/DecisionCard/AIDeepDive 等子组件 |
| `DecisionCard.tsx` | 决策卡片：方向/评分/入场区/止损/目标位 |
| `AIDeepDive.tsx` | AI深度解读：威科夫阶段进度/关键价格结构/详细文字分析 |
| `EvidenceChain.tsx` | 证据链：4行核心多因子证据（独立 Tab/面板展示）|
| `KeyLevels.tsx` | 关键价位：支撑/阻力/POC/斐波那契关键位 |
| `SentimentCompact.tsx` | 情绪面板：恐贪指数/资金费率/社交热度 |
| `Header.tsx` | 顶部导航栏 |
| `SymbolSidebar.tsx` | 左侧币种快速切换侧栏 |

---

## 四、分析流程（useAnalysis.ts）

每次分析触发 16 个加载步骤：

```
Step 1  抓取K线数据（4周期：15m/1h/4h/1d，各1000根）
Step 2  获取资金费率 + 24h Ticker
Step 3  计算技术指标（RSI/MACD/BB/ADX/ATR，每个周期）
Step 4  威科夫阶段识别（accumulation/markup/distribution/markdown）
Step 5  形态识别（spring/upthrust/sos/sow/none）
Step 6  量价验证
Step 7  Volume Profile 计算（含POC识别）
Step 8  斐波那契回撤/延伸
Step 9  复合人行为分析
Step 10 多周期共振打分
Step 11 因果法则测算（目标价位）
Step 12 动态风控计算（入场区/止损/目标/仓位/盈亏比）
Step 13 市场情绪验证（恐贪指数+资金费率合并）
Step 14 生成本地策略简报（文本）
Step 15 AI大模型深度解读（LLM，可选）
Step 16 社交热度分析
```

**缓存机制：**
- 内存缓存 TTL：60分钟（切换币种/周期复用，不重复扣积分）
- 同币种+周期重新分析冷却：3分钟
- localStorage 持久化：刷新后直接恢复上次结果（aiReport 单独存储以防超限）
- 数据时效状态：`fresh`（新鲜）/ `stale`（轻微过期）/ `expired`（严重过期）

---

## 五、评分引擎（scoring.ts）

**5个维度 → 加权融合概率**

| 维度 | 权重 | 计算方式 |
|------|------|----------|
| 威科夫形态（wyckoff） | 35% | 阶段置信度 + 形态加减分 |
| 成交量配合（volume） | 25% | 量价验证状态 + 近期K线量比 |
| 订单簿筹码（orderbook） | 10% | 外部注入（0~100） |
| 市场情绪（sentiment） | 30% | 恐贪指数 + 资金费率极端值修正 |
| 多周期共振（momentum） | 辅助 | RSI/MACD/BB/ADX 多周期信号统计 |

**方向判断：** 多周期加权技术得分 `techScore > 2` → 多头；`< -2` → 空头；否则中性  
**概率区间：** 多/空 → `[40, 92]`；中性 → `[40, 65]`  
**评分权重配比：** 技术面70% + 情绪面30%

---

## 六、AI 报告系统（aiAnalysis.ts）

**数据流：**
```
本地 AnalysisResult → buildMarketContext() → 结构化 Markdown Prompt
→ System Prompt（可在 AI调教室自定义）
→ LLM API（通过 /functions/api/llm 代理，Key 不出浏览器）
→ 结构化 JSON 响应解析
→ 后置价格方向校验修正（防止 AI 方向错误）
→ AIStrategyReport
```

**AIStrategyReport 字段：** 方向/评分/入场区间/止损/目标一二/盈亏比/仓位建议/威科夫评分/成交量评分/订单簿评分/AI摘要/威科夫阶段分析/关键价格结构/情绪标签/新闻情感摘要等

**LLM 配置：** 通过 Cloudflare Pages 环境变量注入（Key 不暴露给前端）：
- `LLM_API_KEY`
- `LLM_BASE_URL`（如 `https://api.deepseek.com/v1`）
- `LLM_MODEL`（如 `deepseek-chat`）

**自定义 System Prompt：** 支持在 Admin 页面 AI调教室修改，存储于 `localStorage`。

---

## 七、PC / 移动端布局

### PC（宽屏）
- **左侧**：SymbolSidebar（币种快速切换）
- **中间**：K线图（CandlestickChart，高度380px）+ VolumeProfileBar（右侧56px）
- **右侧**：RightPanel，Tab 切换：AI / 威科夫 / 信号 / 新闻

### 移动端（isMobile）
- 顶部：头部导航
- 中间区域：全屏 Tab 内容
- 底部固定 Tab 栏（4个）：

| Tab | 图标 | 内容 |
|-----|------|------|
| AI 报告 | ✦ | RightPanel（DecisionCard + AIDeepDive） |
| 证据链 | ⛓ | EvidenceChain |
| 情绪 | ◎ | SentimentCompact + KeyLevels |
| 技术指标 | ≋ | IndicatorPanel + VSASignalPanel |

> 注：K线图折叠区和威科夫Tab已于 2026-05-14 从移动端移除。

---

## 八、积分/配额系统

- 每次分析新币种消耗一次配额（同币种切周期不消耗）
- `getQuota()` 返回：daily 剩余次数、total 累计、expireAt、isActive
- 配额不足时弹出 `CreditsModal` 引导充值
- 积分明细/通知：`NotifPanel`
- 充值入口：`AvatarDropdown` → 跳转充值页

---

## 九、支持的交易标的

默认列表（可自定义添加）：
`ETHUSDT` `BTCUSDT` `XAUTUSDT`（黄金）`SOLUSDT` `BNBUSDT` `XRPUSDT` `DOGEUSDT`

自定义标的通过搜索框输入，最多保存于本地 Watchlist（`localStorage`）。

---

## 十、Cloudflare Pages Functions（API 代理层）

所有外部 API 请求均通过 Edge Functions 中转，作用：
1. 规避浏览器 CORS 限制
2. LLM Key 保存在服务端环境变量，不暴露给前端
3. 接入 Cloudflare 全球 CDN，降低延迟

| 路径 | 作用 |
|------|------|
| `/api/binance/*` | Binance Spot K线/行情代理 |
| `/api/fapi/*` | Binance Futures 资金费率代理 |
| `/api/fng/*` | 恐贪指数代理 |
| `/api/gate/*` | Gate.io 代理 |
| `/api/okx/*` | OKX 代理 |
| `/api/llm/*` | LLM 统一代理（DeepSeek/GPT/Claude） |
| `/api/email/*` | OTP 邮件发送（Resend） |
| `/api/nowpayments/*` | 加密支付回调验证 |
| `/api/allorigins/*` | 通用 CORS 代理 |
| `/api/ping` | 健康检查 |

---

## 十一、近期更新记录（最近10次提交）

| commit | 描述 |
|--------|------|
| `b26e388` | 移除K线折叠区和威科夫Tab，移动端底部Tab精简为4个 |
| `03c6f1f` | 补全移动端K线图折叠区+证据链/情绪Tab（底部Tab扩展至5个）|
| `211ffcd` | 置信度溢出修复+评分权重技术70%情绪30%+证据链补全4行+策略解读三档文案 |
| `7ed9c1e` | 策略深度解读改名+4组件亮色化+字体全面放大+证据链去折叠 |
| `8b86a19` | AI策略报告列精简+证据链移至独立Tab+统一亮色主题 |
| `0a51c24` | 证据链↔AI解读换序+关键价位/市场情绪替换量化信号/社交热度Tab |
| `6d14610` | 修复误删</div>导致tsc构建失败 |
| `2da68f5` | 移除订单簿展示+新右侧面板（DecisionCard/AIDeepDive/EvidenceChain/KeyLevels/SentimentCompact）|
| `0420e28` | 社交热度分析+VSA量价信号面板+量化信号Tab+AI简报结论摘要条 |
| `c7f6f59` | 修复 free_trial plan_id 外键报错；登录延迟加载订阅缓存 |

---

## 十二、本地开发

```bash
cd wyckoff-pro
npm install
npm run dev        # http://localhost:5173

# 构建+类型检查
npm run build      # tsc -b && vite build

# 预览 Cloudflare Functions（需要 wrangler）
npx wrangler pages dev dist
```

**依赖：**
- `lightweight-charts ^5.1.0`：专业K线图
- `recharts ^3.8.1`：数据可视化
- `@supabase/supabase-js ^2.105.1`：认证+数据库
- `lucide-react ^1.8.0`：图标
- `wrangler ^3.114.17`：Cloudflare Pages 本地调试

---

## 十三、部署注意事项

1. Cloudflare Dashboard → Pages → `wyckoff-pro-git` → Settings → Environment variables 配置：
   - `LLM_API_KEY`
   - `LLM_BASE_URL`（如 `https://api.deepseek.com/v1`）
   - `LLM_MODEL`（如 `deepseek-chat`）

2. Supabase 相关变量需同步配置（见 `src/api/auth.ts`）

3. 推送 `main` 分支后 Cloudflare Pages 自动构建，通常 1~2 分钟完成
