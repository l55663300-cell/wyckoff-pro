-- 插入默认订阅套餐（在 Supabase SQL Editor 中执行）
DELETE FROM subscription_plans WHERE id IN ('plan_basic', 'plan_pro', 'plan_elite');

INSERT INTO subscription_plans (id, name, cycle, price_usd, duration_days, daily_limit, hourly_limit, is_active, sort_order, popular, perks, updated_at)
VALUES
  (
    'plan_basic', '基础版', 'monthly', 68, 30, 30, 5, true, 1, false,
    ARRAY['每日30次AI分析', '500+币种支持', '全功能访问', '实时行情数据', '邮件信号推送'],
    NOW()
  ),
  (
    'plan_pro', '专业版', 'monthly', 168, 30, 100, 15, true, 2, true,
    ARRAY['每日100次AI分析', '500+币种支持', '全功能访问', '优先响应速度', '策略历史记录', '邮件信号推送'],
    NOW()
  ),
  (
    'plan_elite', '旗舰版', 'quarterly', 388, 90, 200, 30, true, 3, false,
    ARRAY['每日200次AI分析', '500+币种支持', '最快响应速度', '邮件信号推送', '微信推送', '专属客服支持'],
    NOW()
  );
