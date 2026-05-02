import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 3500) => {
    const id = ++counter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const colorMap: Record<ToastType, { bg: string; border: string; icon: string }> = {
    success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.4)', icon: '✓' },
    error:   { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.4)',  icon: '✕' },
    info:    { bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.4)', icon: 'ℹ' },
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast 容器 */}
      <div style={{
        position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
        zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        pointerEvents: 'none',
      }}>
        {toasts.map(t => {
          const c = colorMap[t.type];
          return (
            <ToastBubble key={t.id} message={t.message} bg={c.bg} border={c.border} icon={c.icon} />
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

function ToastBubble({ message, bg, border, icon }: {
  message: string; bg: string; border: string; icon: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 触发入场动画
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 18px', borderRadius: 12,
      background: bg, border: `1px solid ${border}`,
      backdropFilter: 'blur(12px)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      fontSize: 14, color: 'var(--t1)', fontWeight: 500,
      pointerEvents: 'auto',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(-10px)',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
      whiteSpace: 'nowrap', maxWidth: '90vw',
    }}>
      <span style={{ fontWeight: 700, fontSize: 15 }}>{icon}</span>
      {message}
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
}
