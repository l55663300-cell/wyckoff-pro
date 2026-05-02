/**
 * userStore — 用户信息 Supabase 持久化
 */

import { supabase } from '../lib/supabase';

export interface StoredUser {
  uid: string;
  email: string;
  name: string;
  credits: number;
  inviteCode: string;
  invitedBy?: string;
  status: 'active' | 'banned';
  createdAt: string;
  subscriptionPlan?: string;
  subscriptionExpireAt?: string;
}

function rowToUser(row: Record<string, unknown>): StoredUser {
  return {
    uid: row.uid as string,
    email: row.email as string,
    name: (row.name as string) ?? (row.email as string).split('@')[0],
    credits: 0,
    inviteCode: (row.invite_code as string) ?? '',
    invitedBy: row.invited_by as string | undefined,
    status: (row.status as 'active' | 'banned') ?? 'active',
    createdAt: row.created_at as string,
  };
}

export async function loadUsers(): Promise<StoredUser[]> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  return (data ?? []).map(rowToUser);
}

/** 注册/登录时同步用户信息（触发器已自动创建 profile，此处仅补充更新） */
export async function upsertUser(u: {
  uid: string;
  email: string;
  name: string;
  credits: number;
  inviteCode: string;
  isAdmin?: boolean;
}): Promise<void> {
  if (u.isAdmin) return;
  await supabase.from('profiles').upsert({
    uid: u.uid,
    email: u.email,
    name: u.name,
  }, { onConflict: 'uid', ignoreDuplicates: true });
}

/** 封禁 / 解封 */
export async function toggleUserBan(uid: string): Promise<StoredUser | null> {
  const { data: current } = await supabase
    .from('profiles')
    .select('status')
    .eq('uid', uid)
    .single();
  if (!current) return null;

  const newStatus = current.status === 'banned' ? 'active' : 'banned';
  const { data } = await supabase
    .from('profiles')
    .update({ status: newStatus })
    .eq('uid', uid)
    .select()
    .single();
  return data ? rowToUser(data) : null;
}

/** credits 字段保留兼容，实际限流走 subscriptionStore */
export function updateUserCredits(_uid: string, _email: string, _delta: number): null {
  return null;
}

export function setUserCredits(_uid: string, _credits: number): null {
  return null;
}
