-- ============================================================
-- 002_sync_tables.sql
-- 新增：site_config / user_fav_coins / invite_records / strategy_history
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================================

-- ─── 1. site_config（系统配置 + 网站内容，合并两表） ─────────────────────────

CREATE TABLE IF NOT EXISTS site_config (
  key   TEXT PRIMARY KEY,           -- 配置键名，如 'sys_config' / 'site_content'
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 初始化默认系统配置行（如已存在则不覆盖）
INSERT INTO site_config (key, value) VALUES
(
  'sys_config',
  '{
    "siteName": "AI威科夫Pro",
    "supportEmail": "support@wyckoff.pro",
    "supportWeChat": "",
    "supportNote": "工作日 09:00–18:00 响应",
    "subscriptionNote": "• 提交订单后，请耐心等待管理员审核。\n• 审核通过后订阅立即生效，到期前续费可顺延。\n• 不支持退款，如有问题请联系客服邮箱或微信。\n• 请确保转账网络与钱包一致，否则资产将永久丢失。",
    "reviewTimeNote": "工作日 2 小时内审核，节假日可能延迟",
    "paymentNote": "📌 请向上方对应网络地址转账对应金额 USDT\n📧 转账备注请填写您的注册邮箱\n⚠️ 请确认网络类型与钱包一致，否则资产将永久丢失",
    "registrationOpen": true,
    "maintenanceMode": false,
    "freeTrialDailyLimit": 3,
    "freeTrialDays": 3,
    "adminNotifyEmail": "",
    "adminNotifySendKey": "",
    "inviterRewardCredits": 10,
    "inviteeRewardCredits": 5,
    "inviteRewardCap": 500,
    "loginLockThreshold": 5,
    "loginLockMinutes": 30,
    "apiRateLimitPerMin": 60,
    "aiQueryLimitPerHour": 100,
    "autoPayEnabled": false
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO site_config (key, value) VALUES
(
  'site_content',
  '{
    "hero": {
      "title": "用 AI 读懂威科夫筹码的秘密",
      "subtitle": "基于实时行情数据 + DeepSeek AI，提供专业的威科夫阶段识别、风控计划与个性化策略建议",
      "ctaText": "🎯 立即开始分析",
      "ctaSubText": "注册即送 5 次免费体验"
    },
    "banner": {
      "enabled": true,
      "text": "🎉 新用户注册即送 5 次免费 AI 策略分析 · 首充立享最高 30% 额外次数加赠",
      "linkText": "立即领取"
    },
    "pricing": {
      "oneTimePacks": [
        { "count": 20,  "price": 18 },
        { "count": 50,  "price": 38 },
        { "count": 100, "price": 58 },
        { "count": 300, "price": 128 },
        { "count": 500, "price": 168 }
      ]
    }
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- RLS：仅管理员可写，所有人可读（通过 anon key）
ALTER TABLE site_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_config_read_all"  ON site_config FOR SELECT USING (true);
CREATE POLICY "site_config_write_admin" ON site_config FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ─── 2. user_fav_coins（收藏币种，跨设备同步） ────────────────────────────────

CREATE TABLE IF NOT EXISTS user_fav_coins (
  uid    TEXT PRIMARY KEY,
  coins  TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_fav_coins ENABLE ROW LEVEL SECURITY;

-- 用户只能读写自己的收藏
CREATE POLICY "fav_coins_own" ON user_fav_coins FOR ALL
  USING (uid = auth.uid()::text)
  WITH CHECK (uid = auth.uid()::text);

-- 管理员可读全表
CREATE POLICY "fav_coins_admin_read" ON user_fav_coins FOR SELECT
  USING (auth.role() = 'service_role');

-- ─── 3. invite_records（邀请统计，按邀请人 uid 存储） ─────────────────────────

CREATE TABLE IF NOT EXISTS invite_records (
  uid            TEXT PRIMARY KEY,
  total_invited  INT NOT NULL DEFAULT 0,
  total_paid     INT NOT NULL DEFAULT 0,
  total_reward   INT NOT NULL DEFAULT 0,
  records        JSONB NOT NULL DEFAULT '[]',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE invite_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invite_records_own" ON invite_records FOR ALL
  USING (uid = auth.uid()::text)
  WITH CHECK (uid = auth.uid()::text);

CREATE POLICY "invite_records_admin_read" ON invite_records FOR SELECT
  USING (auth.role() = 'service_role');

-- ─── 4. strategy_history（策略历史，按用户隔离） ─────────────────────────────

CREATE TABLE IF NOT EXISTS strategy_history (
  id              TEXT PRIMARY KEY,
  uid             TEXT NOT NULL,
  symbol          TEXT NOT NULL,
  timeframe       TEXT NOT NULL,
  direction       TEXT NOT NULL,
  probability     FLOAT NOT NULL,
  entry_price     FLOAT NOT NULL,
  stop_loss       FLOAT NOT NULL,
  target1         FLOAT NOT NULL,
  target2         FLOAT NOT NULL,
  target3         FLOAT NOT NULL,
  result          TEXT NOT NULL DEFAULT 'pending',  -- win/loss/breakeven/pending
  exit_price      FLOAT,
  profit_percent  FLOAT,
  close_time      BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timestamp       BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS strategy_history_uid_idx ON strategy_history(uid);
CREATE INDEX IF NOT EXISTS strategy_history_created_idx ON strategy_history(created_at DESC);

ALTER TABLE strategy_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "strategy_history_own" ON strategy_history FOR ALL
  USING (uid = auth.uid()::text)
  WITH CHECK (uid = auth.uid()::text);

CREATE POLICY "strategy_history_admin_read" ON strategy_history FOR SELECT
  USING (auth.role() = 'service_role');
