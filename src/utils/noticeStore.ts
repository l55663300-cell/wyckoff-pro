/**
 * noticeStore — 系统公告的 localStorage 持久化
 * key: wyckoff_notices
 */

export interface Notice {
  id: string;
  title: string;
  content: string;
  type: 'announcement' | 'ai_upgrade' | 'maintenance' | 'activity';
  createdAt: string;
  read?: boolean;
}

const LS_KEY = 'wyckoff_notices';

export function loadNotices(): Notice[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Notice[]) : [];
  } catch { return []; }
}

function saveNotices(notices: Notice[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(notices));
}

export function pushNotice(n: Omit<Notice, 'id' | 'createdAt'>) {
  const notices = loadNotices();
  const newNotice: Notice = {
    ...n,
    id: `n_${Date.now()}`,
    createdAt: new Date().toISOString(),
    read: false,
  };
  notices.unshift(newNotice);
  saveNotices(notices);
  return newNotice;
}

export function markAllRead() {
  const notices = loadNotices();
  notices.forEach(n => { n.read = true; });
  saveNotices(notices);
}

export function getUnreadCount(): number {
  return loadNotices().filter(n => !n.read).length;
}
