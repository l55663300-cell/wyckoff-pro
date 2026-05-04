import React, { useState, useEffect } from 'react';
import { loadNoticesFromDB, markAllRead, type Notice } from '../../utils/noticeStore';

interface Props {
  onClose: () => void;
  onGoRecharge: () => void;
  uid?: string;
}

const TYPE_ICON: Record<string, { icon: string; bg: string }> = {
  announcement: { icon: '📢', bg: 'rgba(100,160,255,0.12)' },
  ai_upgrade:   { icon: '🤖', bg: 'rgba(240,180,41,0.12)' },
  maintenance:  { icon: '⚠️', bg: 'rgba(255,100,80,0.12)' },
  activity:     { icon: '🎁', bg: 'rgba(0,200,100,0.12)' },
};

export function NotifPanel({ onClose, onGoRecharge, uid }: Props) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadNoticesFromDB(uid).then(data => {
      setNotices(data);
      setLoading(false);
    });
  }, [uid]);

  const unreadCount = notices.filter(n => !n.read).length;

  const handleMarkAllRead = async () => {
    await markAllRead();
    setNotices(ns => ns.map(n => ({ ...n, read: true })));
  };

  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340, maxHeight: 460,
      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16,
      boxShadow: '0 8px 32px rgba(0,0,0,.5)', zIndex: 999,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>
          消息通知 {unreadCount > 0 && <span style={{ fontSize: 11, background: 'var(--red)', color: '#fff', borderRadius: 20, padding: '1px 6px', marginLeft: 4 }}>{unreadCount}</span>}
        </span>
        <span style={{ fontSize: 12, color: 'var(--primary)', cursor: 'pointer' }} onClick={handleMarkAllRead}>全部已读</span>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t3)', fontSize: 13 }}>加载中...</div>
        ) : notices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t3)', fontSize: 13 }}>暂无通知</div>
        ) : notices.map(n => {
          const { icon, bg } = TYPE_ICON[n.type] ?? TYPE_ICON.announcement;
          const fmtTime = (iso: string) => {
            try {
              const d = new Date(iso);
              const now = new Date();
              const isToday = d.toDateString() === now.toDateString();
              return isToday
                ? '今天 ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                : d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
            } catch { return iso; }
          };
          return (
            <div key={n.id} style={{
              display: 'flex', gap: 12, padding: '14px 16px',
              borderBottom: '1px solid rgba(30,45,66,0.4)', cursor: 'pointer',
              background: n.read ? 'transparent' : 'rgba(240,180,41,0.03)',
              transition: 'background .15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(240,180,41,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(240,180,41,0.03)')}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, flexShrink: 0, background: bg,
              }}>{icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {!n.read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, display: 'inline-block' }} />}
                  {n.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.5 }}>{n.content}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>{fmtTime(n.createdAt)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
