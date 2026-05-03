/**
 * feedbackStore — 用户反馈，读写 Supabase feedback 表
 */

import { supabase } from '../lib/supabase';

export type FeedbackType = 'bug' | 'feature' | 'complaint' | 'other';
export type FeedbackStatus = 'pending' | 'processing' | 'resolved';

export interface FeedbackItem {
  id: string;
  uid: string;
  email: string;
  type: FeedbackType;
  content: string;
  status: FeedbackStatus;
  reply?: string;
  createdAt: string;
  updatedAt: string;
}

export const FEEDBACK_TYPE_LABEL: Record<FeedbackType, string> = {
  bug: '🐛 Bug反馈',
  feature: '💡 功能建议',
  complaint: '🚨 投诉',
  other: '💬 其他',
};

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, { label: string; color: string; bg: string }> = {
  pending:    { label: '待处理', color: '#f0b429',  bg: 'rgba(240,180,41,0.12)' },
  processing: { label: '处理中', color: '#63b3ed',  bg: 'rgba(99,179,237,0.12)' },
  resolved:   { label: '已解决', color: '#00c896',  bg: 'rgba(0,200,150,0.12)' },
};

function rowToItem(row: Record<string, unknown>): FeedbackItem {
  return {
    id: row.id as string,
    uid: row.uid as string,
    email: row.email as string,
    type: row.type as FeedbackType,
    content: row.content as string,
    status: row.status as FeedbackStatus,
    reply: row.reply as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** 管理员后台加载全部反馈（async） */
export async function loadFeedbackFromDB(): Promise<FeedbackItem[]> {
  const { data, error } = await supabase
    .from('feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error || !data) return [];
  return data.map(rowToItem);
}

/** 兼容同步调用（返回空数组，页面切换时触发 async 版本） */
export function loadFeedback(): FeedbackItem[] {
  return [];
}

/** 用户提交反馈（写 Supabase） */
export async function submitFeedback(
  u: { uid: string; email: string },
  type: FeedbackType,
  content: string,
): Promise<FeedbackItem | null> {
  const id = `fb_${Date.now()}`;
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('feedback').insert({
    id,
    uid: u.uid,
    email: u.email,
    type,
    content,
    status: 'pending',
    created_at: now,
    updated_at: now,
  }).select().single();
  if (error || !data) {
    console.warn('[feedbackStore] 提交失败', error?.message);
    return null;
  }
  return rowToItem(data as Record<string, unknown>);
}

/** 管理员更新反馈状态（写 Supabase） */
export async function updateFeedbackStatus(
  id: string,
  status: FeedbackStatus,
  reply?: string,
): Promise<FeedbackItem | null> {
  const { data, error } = await supabase
    .from('feedback')
    .update({ status, reply: reply ?? null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error || !data) return null;
  return rowToItem(data as Record<string, unknown>);
}
