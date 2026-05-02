import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { upsertUser } from '../utils/userStore';
import {
  checkAndConsumeQuota,
  getRemainingQuota,
  loadSubCache,
  type QuotaCheckResult,
} from '../utils/subscriptionStore';
import { apiGetSession, apiLogout, type AuthUser } from '../api/auth';

export type PageType = 'landing' | 'login' | 'app' | 'user' | 'recharge' | 'admin' | 'resetPassword';

export interface UserInfo {
  uid: string;
  email: string;
  name: string;
  credits: number;
  inviteCode: string;
  isAdmin: boolean;
}

interface AppContextType {
  page: PageType;
  navigate: (p: PageType) => void;
  user: UserInfo | null;
  authLoading: boolean;
  login: (u: AuthUser) => void;
  logout: () => void;
  deductCredit: () => void;
  addCredits: (n: number) => void;
  consumeQuota: () => Promise<QuotaCheckResult>;
  getQuota: () => Promise<{ daily: number; total: number; expireAt: string | null; isActive: boolean }>;
}

const AppContext = createContext<AppContextType | null>(null);

const LS_PAGE_KEY = 'wyckoff_last_page_v1';

function loadLastPage(u: UserInfo | null): PageType {
  if (!u) return 'landing';
  try {
    const saved = localStorage.getItem(LS_PAGE_KEY) as PageType | null;
    if (saved) {
      if (saved === 'admin' && !u.isAdmin) return 'app';
      if (['app', 'user', 'recharge', 'admin'].includes(saved) && saved !== 'login') return saved;
    }
  } catch {}
  return u.isAdmin ? 'admin' : 'app';
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [page, setPage] = useState<PageType>('landing');
  const [authLoading, setAuthLoading] = useState(true);

  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // ── 启动时恢复 Supabase session ──────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      try {
        const authUser = await apiGetSession();
        if (!mounted) return;
        if (authUser) {
          const userInfo: UserInfo = {
            uid: authUser.uid,
            email: authUser.email,
            name: authUser.name,
            credits: authUser.credits,
            inviteCode: authUser.inviteCode,
            isAdmin: authUser.isAdmin,
          };
          setUser(userInfo);
          setPage(loadLastPage(userInfo));
          // 预热订阅缓存
          void loadSubCache(authUser.uid);
        }
      } catch (e) {
        console.warn('[Auth] session 恢复失败', e);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };

    void restoreSession();

    // 监听 Supabase Auth 状态变化（token 刷新等）
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        if (mounted) { setUser(null); setPage('landing'); }
      }
      if (event === 'TOKEN_REFRESHED' && session) {
        // token 刷新后不需要重新拉 profile，直接更新
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const navigate = useCallback((p: PageType) => {
    const cur = userRef.current;
    if ((p === 'app' || p === 'user' || p === 'recharge') && !cur) {
      setPage('login'); return;
    }
    if (p === 'admin' && !cur?.isAdmin) {
      setPage('login'); return;
    }
    setPage(p);
    if (p !== 'login' && p !== 'resetPassword') {
      try { localStorage.setItem(LS_PAGE_KEY, p); } catch {}
    }
    window.scrollTo(0, 0);
  }, []);

  const login = useCallback((u: AuthUser) => {
    const userInfo: UserInfo = {
      uid: u.uid,
      email: u.email,
      name: u.name,
      credits: u.credits,
      inviteCode: u.inviteCode,
      isAdmin: u.isAdmin,
    };
    setUser(userInfo);
    upsertUser(userInfo);
    void loadSubCache(u.uid);
    setPage(u.isAdmin ? 'admin' : 'app');
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    localStorage.removeItem(LS_PAGE_KEY);
    setPage('landing');
  }, []);

  const deductCredit = useCallback(() => {
    // credits 字段已改为订阅配额体系，deductCredit 保留兼容
  }, []);

  const addCredits = useCallback((_n: number) => {
    // 同上，保留兼容
  }, []);

  const consumeQuota = useCallback(async (): Promise<QuotaCheckResult> => {
    const cur = userRef.current;
    if (!cur) return { allowed: false, reason: '请先登录' };
    return checkAndConsumeQuota(cur.uid);
  }, []);

  const getQuota = useCallback(async () => {
    const cur = userRef.current;
    if (!cur) return { daily: 0, total: 0, expireAt: null, isActive: false };
    return getRemainingQuota(cur.uid);
  }, []);

  return (
    <AppContext.Provider value={{
      page, navigate, user, authLoading,
      login, logout, deductCredit, addCredits,
      consumeQuota, getQuota,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
