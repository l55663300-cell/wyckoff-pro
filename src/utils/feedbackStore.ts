/**
 * feedbackStore — 用户反馈的 localStorage 持久化
 * key: wyckoff_feedback
 */

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

const LS_KEY = 'wyckoff_feedback';

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

export function loadFeedback(): FeedbackItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as FeedbackItem[]) : [];
  } catch { return []; }
}

function saveFeedback(items: FeedbackItem[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}

export function submitFeedback(u: { uid: string; email: string }, type: FeedbackType, content: string) {
  const items = loadFeedback();
  const item: FeedbackItem = {
    id: `fb_${Date.now()}`,
    uid: u.uid,
    email: u.email,
    type,
    content,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  items.unshift(item);
  saveFeedback(items);
  return item;
}

export function updateFeedbackStatus(id: string, status: FeedbackStatus, reply?: string): FeedbackItem | null {
  const items = loadFeedback();
  const idx = items.findIndex(x => x.id === id);
  if (idx < 0) return null;
  items[idx] = { ...items[idx], status, reply: reply ?? items[idx].reply, updatedAt: new Date().toISOString() };
  saveFeedback(items);
  return items[idx];
}
