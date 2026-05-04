/**
 * noticeStore — 系统公告，读写 Supabase notices 表
 * 用户已读状态仍用 localStorage（避免每次读都写库）
 */

import { supabase } from '../lib/supabase';

export interface Notice {
  id: string;
  title: string;
  content: string;
  type: 'announcement' | 'ai_upgrade' | 'maintenance' | 'activity';
  createdAt: string;
  read?: boolean;
}

const READ_LS_KEY = 'wyckoff_notice_read_ids';

function getReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_LS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}

function saveReadIds(ids: Set<string>) {
  try {
    localStorage.setItem(READ_LS_KEY, JSON.stringify([...ids]));
  } catch {}
}

function rowToNotice(row: Record<string, unknown>, readIds: Set<string>): Notice {
  return {
    id: row.id as string,
    title: row.title as string,
    content: row.content as string,
    type: row.type as Notice['type'],
    createdAt: row.created_at as string,
    read: readIds.has(row.id as string),
  };
}

/** 从 Supabase 加载公告列表（async）
 *  若传入 uid，同时加载该用户的定向通知；否则只加载全局公告 */
export async function loadNoticesFromDB(uid?: string): Promise<Notice[]> {
  let query = supabase
    .from('notices')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (uid) {
    // 全局公告(uid is null) + 定向给当前用户的通知
    query = query.or(`uid.is.null,uid.eq.${uid}`);
  } else {
    query = query.is('uid', null);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  const readIds = getReadIds();
  return data.map(row => rowToNotice(row as Record<string, unknown>, readIds));
}

/** 同步版本兼容旧调用（返回空，调用方应改用 async 版） */
export function loadNotices(): Notice[] {
  return [];
}

/** 管理员推送公告（写 Supabase） */
export async function pushNotice(n: Omit<Notice, 'id' | 'createdAt'>): Promise<Notice | null> {
  const { data, error } = await supabase.from('notices').insert({
    title: n.title,
    content: n.content,
    type: n.type,
    created_at: new Date().toISOString(),
  }).select().single();
  if (error || !data) {
    console.warn('[noticeStore] 推送失败', error?.message);
    return null;
  }
  return rowToNotice(data as Record<string, unknown>, getReadIds());
}

/** 标记全部已读（写 localStorage） */
export async function markAllRead(): Promise<void> {
  const { data } = await supabase.from('notices').select('id');
  if (data) {
    const ids = new Set((data as { id: string }[]).map(r => r.id));
    saveReadIds(ids);
  }
}

/** 获取未读数（从 Supabase，async） */
export async function getUnreadCountAsync(): Promise<number> {
  const { data } = await supabase.from('notices').select('id').order('created_at', { ascending: false }).limit(100);
  if (!data) return 0;
  const readIds = getReadIds();
  return data.filter((r: { id: string }) => !readIds.has(r.id)).length;
}

/** 同步版本（读 localStorage 缓存） */
export function getUnreadCount(): number {
  // 由于改为 async，此同步版本始终返回 0，调用方应改用 getUnreadCountAsync
  return 0;
}
