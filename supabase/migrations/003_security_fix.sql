-- ============================================================
-- 003_security_fix.sql
-- 1. 新增 recharge_orders 表（充值申请迁出 localStorage）
-- 2. 补全敏感表管理员写权限 RLS 策略
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================================

-- ─── 1. recharge_orders 表 ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recharge_orders (
  id           TEXT PRIMARY KEY,
  uid          TEXT NOT NULL,
  email        TEXT NOT NULL,
  pack_label   TEXT NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  price        NUMERIC(10,2) NOT NULL DEFAULT 0,
  pay_method   TEXT NOT NULL,                          -- 'wechat' | 'alipay' | 'usdt'
  status       TEXT NOT NULL DEFAULT 'pending',        -- 'pending' | 'approved' | 'rejected'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at  TIMESTAMPTZ,
  remark       TEXT
);

CREATE INDEX IF NOT EXISTS recharge_orders_uid_idx    ON recharge_orders(uid);
CREATE INDEX IF NOT EXISTS recharge_orders_status_idx ON recharge_orders(status);
CREATE INDEX IF NOT EXISTS recharge_orders_created_idx ON recharge_orders(created_at DESC);

ALTER TABLE recharge_orders ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的订单
CREATE POLICY "recharge_orders_user_select" ON recharge_orders
  FOR SELECT USING (uid = auth.uid()::text);

-- 用户只能插入自己的订单
CREATE POLICY "recharge_orders_user_insert" ON recharge_orders
  FOR INSERT WITH CHECK (uid = auth.uid()::text);

-- 只有管理员可以更新订单（审核操作）
CREATE POLICY "recharge_orders_admin_update" ON recharge_orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
        AND profiles.is_admin = true
    )
  );

-- 管理员可以查看全部订单
CREATE POLICY "recharge_orders_admin_select" ON recharge_orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
        AND profiles.is_admin = true
    )
  );

-- ─── 2. site_config 表：只有管理员可写 ───────────────────────────────────────

-- 删除旧的宽泛写策略（如有）
DROP POLICY IF EXISTS "site_config_write" ON site_config;
DROP POLICY IF EXISTS "site_config_admin_write" ON site_config;

-- 重建：只有 is_admin=true 的用户可以写
CREATE POLICY "site_config_admin_write" ON site_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
        AND profiles.is_admin = true
    )
  );

-- ─── 3. invite_records 表：补充管理员可读 ────────────────────────────────────

DROP POLICY IF EXISTS "invite_records_admin_read" ON invite_records;
CREATE POLICY "invite_records_admin_read" ON invite_records
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
        AND profiles.is_admin = true
    )
  );

-- ─── 4. strategy_history 表：补充管理员可读 ──────────────────────────────────

-- 已在 002 中建立，此处确保管理员可读策略存在
DROP POLICY IF EXISTS "strategy_history_admin_read" ON strategy_history;
CREATE POLICY "strategy_history_admin_read" ON strategy_history
  FOR SELECT USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.uid = auth.uid()
        AND profiles.is_admin = true
    )
  );
