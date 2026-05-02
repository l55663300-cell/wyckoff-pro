import React from 'react';
import { UserInfo } from '../../context/AppContext';

interface Props {
  user: UserInfo | null;
  onClose: () => void;
  onUser: () => void;
  onRecharge: () => void;
  onFeedback: () => void;
  onAdmin?: () => void;
  onLogout: () => void;
}

export function AvatarDropdown({ user, onClose, onUser, onRecharge, onFeedback, onAdmin, onLogout }: Props) {
  const menuItems = [
    { icon: '👤', label: '个人中心', action: onUser },
    { icon: '💳', label: '充值次数', action: onRecharge },
    { icon: '💬', label: '意见反馈', action: onFeedback },
    ...(user?.isAdmin && onAdmin ? [{ icon: '⚙️', label: '后台管理', action: onAdmin }] : []),
  ];

  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 8px)', right: 0,
      background: 'var(--bg2)', border: '1.5px solid var(--border)',
      borderRadius: 12, minWidth: 160, boxShadow: '0 8px 32px rgba(0,0,0,.5)',
      zIndex: 2000, overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{user?.name ?? '用户'}</div>
        <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{user?.email}</div>
      </div>
      {menuItems.map(item => (
        <div key={item.label} onClick={item.action} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', fontSize: 13, color: 'var(--t2)',
          cursor: 'pointer', transition: 'background .15s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg3)'; (e.currentTarget as HTMLDivElement).style.color = 'var(--t1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = ''; (e.currentTarget as HTMLDivElement).style.color = 'var(--t2)'; }}
        >
          {item.icon} {item.label}
        </div>
      ))}
      <div onClick={onLogout} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', fontSize: 13, color: '#f87171',
        cursor: 'pointer', transition: 'background .15s',
      }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,.08)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
      >
        🚪 退出登录
      </div>
    </div>
  );
}
