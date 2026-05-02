import React, { useState } from 'react';

interface Props {
  onClose: () => void;
  onGoRecharge: () => void;
}

interface Notif {
  id: number;
  icon: string;
  iconBg: string;
  title: string;
  desc: string;
  time: string;
  unread: boolean;
}

const INIT_NOTIFS: Notif[] = [
  { id: 1, icon: '💰', iconBg: 'rgba(0,200,100,0.12)', title: '充值成功到账', desc: '您申请的 100 次查询已成功到账，当前剩余 142 次，感谢支持！', time: '今天 15:32', unread: true },
  { id: 2, icon: '🎁', iconBg: 'rgba(240,180,41,0.12)', title: '邀请奖励到账', desc: '您邀请的好友 t***r@gmail.com 完成首次充值，奖励 10 次已到账！', time: '今天 11:05', unread: true },
  { id: 3, icon: '📢', iconBg: 'rgba(100,160,255,0.12)', title: '功能更新', desc: '新增「准确率统计」模块，现在可在个人中心标记历史分析结果，追踪 AI 胜率。', time: '昨天 10:00', unread: false },
  { id: 4, icon: '🤖', iconBg: 'rgba(240,180,41,0.12)', title: 'AI模型升级', desc: '底层分析模型已升级至 DeepSeek V3，威科夫阶段识别准确率提升约 15%。', time: '04-20 09:00', unread: false },
];

export function NotifPanel({ onClose, onGoRecharge }: Props) {
  const [notifs, setNotifs] = useState<Notif[]>(INIT_NOTIFS);

  const markAllRead = () => setNotifs(ns => ns.map(n => ({ ...n, unread: false })));
  const unreadCount = notifs.filter(n => n.unread).length;

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
        <span style={{ fontSize: 12, color: 'var(--primary)', cursor: 'pointer' }} onClick={markAllRead}>全部已读</span>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {notifs.map(n => (
          <div key={n.id} style={{
            display: 'flex', gap: 12, padding: '14px 16px',
            borderBottom: '1px solid rgba(30,45,66,0.4)', cursor: 'pointer',
            background: n.unread ? 'rgba(240,180,41,0.03)' : 'transparent',
            transition: 'background .15s',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(240,180,41,0.04)')}
            onMouseLeave={e => (e.currentTarget.style.background = n.unread ? 'rgba(240,180,41,0.03)' : 'transparent')}
            onClick={() => setNotifs(ns => ns.map(x => x.id === n.id ? { ...x, unread: false } : x))}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, flexShrink: 0, background: n.iconBg,
            }}>{n.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                {n.unread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, display: 'inline-block' }} />}
                {n.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.5 }}>{n.desc}</div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>{n.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
