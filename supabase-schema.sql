-- ============================================================
-- wyckoff-pro Supabase 数据库建表脚本
-- 在 Supabase Dashboard → SQL Editor 中执行此脚本
-- ============================================================

-- 1. 用户扩展信息表（Auth 表由 Supabase 自动管理，此表存业务字段）
create table if not exists public.profiles (
  uid          uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  name         text,
  invite_code  text unique not null,
  invited_by   text,                          -- 邀请人的 invite_code
  is_admin     boolean default false,
  status       text default 'active' check (status in ('active', 'banned')),
  created_at   timestamptz default now()
);

-- 开启 RLS
alter table public.profiles enable row level security;

-- 用户只能读自己，管理员可读全部
create policy "用户读自己的 profile"
  on public.profiles for select
  using (auth.uid() = uid);

create policy "管理员读全部 profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.uid = auth.uid() and p.is_admin = true
    )
  );

create policy "用户可更新自己的 profile"
  on public.profiles for update
  using (auth.uid() = uid);

-- 2. 套餐配置表
create table if not exists public.subscription_plans (
  id            text primary key,
  name          text not null,
  cycle         text not null check (cycle in ('monthly','quarterly','yearly')),
  price_usd     numeric(10,2) not null,
  duration_days int not null,
  daily_limit   int not null,
  hourly_limit  int not null,
  is_active     boolean default true,
  sort_order    int default 0,
  popular       boolean default false,
  perks         text[] default '{}',
  updated_at    timestamptz default now()
);

alter table public.subscription_plans enable row level security;

create policy "所有人可读活跃套餐"
  on public.subscription_plans for select
  using (is_active = true or exists (
    select 1 from public.profiles p where p.uid = auth.uid() and p.is_admin = true
  ));

-- 只有管理员可修改
create policy "管理员可修改套餐"
  on public.subscription_plans for all
  using (
    exists (select 1 from public.profiles p where p.uid = auth.uid() and p.is_admin = true)
  );

-- 插入默认套餐
insert into public.subscription_plans values
  ('basic_monthly',   '基础版',     'monthly',   9.9,  30, 30,  5,  true, 1, false, array['全功能访问','500+币种','AI策略报告','每日30次'],           now()),
  ('pro_monthly',     '专业版',     'monthly',  29.9,  30, 80,  12, true, 2, true,  array['全功能访问','500+币种','优先响应','微信行情推送','每日80次'], now()),
  ('pro_quarterly',   '专业版季度', 'quarterly', 79.9,  90, 80,  12, true, 3, false, array['全功能访问','500+币种','优先响应','微信行情推送','每日80次','季付省¥10'], now()),
  ('elite_monthly',   '机构版',     'monthly',  79.9,  30, 200, 30, true, 4, false, array['全功能访问','500+币种','最快响应','微信推送','专属客服','每日200次'], now()),
  ('elite_yearly',    '机构版年度', 'yearly',   799,  365, 200, 30, true, 5, false, array['全功能访问','500+币种','最快响应','微信推送','专属客服','每日200次','年付省约17%'], now())
on conflict (id) do nothing;

-- 3. 收款钱包表
create table if not exists public.payment_wallets (
  id         text primary key,
  label      text not null,
  address    text not null,
  network    text not null check (network in ('TRC20','ERC20','BEP20')),
  is_active  boolean default true,
  sort_order int default 0,
  updated_at timestamptz default now()
);

alter table public.payment_wallets enable row level security;

create policy "用户可读活跃钱包"
  on public.payment_wallets for select
  using (is_active = true or exists (
    select 1 from public.profiles p where p.uid = auth.uid() and p.is_admin = true
  ));

create policy "管理员可修改钱包"
  on public.payment_wallets for all
  using (
    exists (select 1 from public.profiles p where p.uid = auth.uid() and p.is_admin = true)
  );

-- 插入默认钱包（上线前记得改成真实地址）
insert into public.payment_wallets values
  ('w1', '主钱包', 'TXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'TRC20', true, 1, now())
on conflict (id) do nothing;

-- 4. 用户订阅状态表
create table if not exists public.user_subscriptions (
  uid            uuid primary key references auth.users(id) on delete cascade,
  plan_id        text references public.subscription_plans(id),
  plan_name      text,
  cycle          text,
  daily_limit    int default 0,
  hourly_limit   int default 0,
  start_at       timestamptz default now(),
  expire_at      timestamptz,
  daily_used     int default 0,
  hourly_used    int default 0,
  last_used_date text default '',
  last_used_hour int default -1,
  updated_at     timestamptz default now()
);

alter table public.user_subscriptions enable row level security;

create policy "用户读自己的订阅"
  on public.user_subscriptions for select
  using (auth.uid() = uid);

create policy "用户插入自己的订阅用量"
  on public.user_subscriptions for insert
  with check (auth.uid() = uid);

create policy "用户更新自己的订阅用量"
  on public.user_subscriptions for update
  using (auth.uid() = uid);

create policy "管理员读写全部订阅"
  on public.user_subscriptions for all
  using (
    exists (select 1 from public.profiles p where p.uid = auth.uid() and p.is_admin = true)
  );

-- 5. 订阅订单表
create table if not exists public.subscription_orders (
  id              text primary key,
  uid             uuid references auth.users(id),
  email           text not null,
  plan_id         text,
  plan_name       text,
  cycle           text,
  amount_usd      numeric(10,2),
  wallet_id       text,
  wallet_address  text,
  wallet_network  text,
  tx_hash         text,
  proof_note      text,
  status          text default 'pending' check (status in ('pending','confirmed','rejected')),
  admin_note      text,
  created_at      timestamptz default now(),
  confirmed_at    timestamptz
);

alter table public.subscription_orders enable row level security;

create policy "用户读自己的订单"
  on public.subscription_orders for select
  using (auth.uid() = uid);

create policy "用户插入自己的订单"
  on public.subscription_orders for insert
  with check (auth.uid() = uid);

create policy "管理员读写全部订单"
  on public.subscription_orders for all
  using (
    exists (select 1 from public.profiles p where p.uid = auth.uid() and p.is_admin = true)
  );

-- 6. 邮箱验证码表（第四步注册验证码使用）
create table if not exists public.email_verify_codes (
  email      text primary key,
  code       text not null,
  expire_at  timestamptz not null,
  created_at timestamptz default now()
);

alter table public.email_verify_codes enable row level security;
-- 验证码仅通过服务端 Edge Function 操作，不开放前端直接读写

-- 7. 注册完成后自动创建 profile 的触发器
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_invite_code text;
begin
  -- 生成唯一邀请码
  v_invite_code := 'WYCK-' || upper(substr(md5(new.id::text), 1, 6));

  insert into public.profiles (uid, email, name, invite_code, invited_by)
  values (
    new.id,
    new.email,
    split_part(new.email, '@', 1),
    v_invite_code,
    new.raw_user_meta_data->>'invited_by'
  );
  return new;
end;
$$;

-- 绑定触发器
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 8. 索引优化
create index if not exists idx_sub_orders_uid on public.subscription_orders(uid);
create index if not exists idx_sub_orders_status on public.subscription_orders(status);
create index if not exists idx_profiles_invite_code on public.profiles(invite_code);

-- 9. AI 查询记录表（管理员后台跨设备查看用）
create table if not exists public.query_logs (
  id          text primary key,
  uid         uuid references auth.users(id) on delete cascade,
  email       text not null,
  symbol      text not null,
  timeframe   text not null,
  direction   text not null,
  score       int default 0,
  phase       text default '',
  outcome     text check (outcome in ('win', 'loss')),
  created_at  timestamptz default now()
);

alter table public.query_logs enable row level security;

-- 用户只能读自己的查询记录
create policy "用户读自己的查询记录"
  on public.query_logs for select
  using (auth.uid() = uid);

-- 用户可插入自己的查询记录
create policy "用户写自己的查询记录"
  on public.query_logs for insert
  with check (auth.uid() = uid);

-- 管理员可读写全部查询记录
create policy "管理员读写全部查询记录"
  on public.query_logs for all
  using (
    exists (select 1 from public.profiles p where p.uid = auth.uid() and p.is_admin = true)
  );

create index if not exists idx_query_logs_uid on public.query_logs(uid);
create index if not exists idx_query_logs_created_at on public.query_logs(created_at desc);

-- ============================================================
-- 补丁：管理员可更新所有人的 profile（含 is_admin 字段）
-- ============================================================
create policy "管理员可更新所有用户的 profile"
  on public.profiles for update
  using (
    exists (select 1 from public.profiles p where p.uid = auth.uid() and p.is_admin = true)
  );

-- ============================================================
-- 9. 用户反馈表
-- ============================================================
create table if not exists public.feedback (
  id          text primary key,
  uid         uuid not null references auth.users(id) on delete cascade,
  email       text not null,
  type        text not null check (type in ('bug','feature','complaint','other')),
  content     text not null,
  status      text not null default 'pending' check (status in ('pending','processing','resolved')),
  reply       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.feedback enable row level security;

create policy "用户插入自己的反馈"
  on public.feedback for insert
  with check (auth.uid() = uid);

create policy "用户读自己的反馈"
  on public.feedback for select
  using (auth.uid() = uid);

create policy "管理员读写全部反馈"
  on public.feedback for all
  using (
    exists (select 1 from public.profiles p where p.uid = auth.uid() and p.is_admin = true)
  );

create index if not exists idx_feedback_uid on public.feedback(uid);
create index if not exists idx_feedback_created_at on public.feedback(created_at desc);

-- ============================================================
-- 10. 系统公告表
-- ============================================================
create table if not exists public.notices (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  content     text not null,
  type        text not null default 'announcement' check (type in ('announcement','ai_upgrade','maintenance','activity')),
  created_at  timestamptz default now()
);

alter table public.notices enable row level security;

create policy "所有登录用户可读公告"
  on public.notices for select
  using (auth.uid() is not null);

create policy "管理员可推送公告"
  on public.notices for insert
  with check (
    exists (select 1 from public.profiles p where p.uid = auth.uid() and p.is_admin = true)
  );

create policy "管理员可删除公告"
  on public.notices for delete
  using (
    exists (select 1 from public.profiles p where p.uid = auth.uid() and p.is_admin = true)
  );

create index if not exists idx_notices_created_at on public.notices(created_at desc);

