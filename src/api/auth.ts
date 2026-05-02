/**
 * Auth API — Supabase 真实实现
 * 注册 / 登录 / 找回密码 / 重置密码
 */

import { supabase } from '../lib/supabase';
import { activateSubscription, getFreeTrialPlan } from '../utils/subscriptionStore';

export interface AuthUser {
  uid: string;
  email: string;
  name: string;
  credits: number;
  inviteCode: string;
  isAdmin: boolean;
  token: string;
}

export interface ApiError {
  message: string;
  code?: number;
}

// ─── 密码强度校验 ────────────────────────────────────────────────────────────
export const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

export function checkPasswordStrength(pw: string): {
  score: 0 | 1 | 2 | 3;
  tips: string[];
} {
  const tips: string[] = [];
  if (pw.length < 8) tips.push('至少8位');
  if (!/[A-Za-z]/.test(pw)) tips.push('含字母');
  if (!/\d/.test(pw)) tips.push('含数字');
  if (!/[^A-Za-z\d]/.test(pw)) tips.push('含特殊字符(!@#$…)');
  const score = (4 - tips.length) as 0 | 1 | 2 | 3;
  return { score, tips };
}

// ─── 辅助：从 profiles 表读取用户扩展信息 ───────────────────────────────────
async function fetchProfile(uid: string): Promise<{
  invite_code: string;
  is_admin: boolean;
  credits: number;
}> {
  const { data } = await supabase
    .from('profiles')
    .select('invite_code, is_admin')
    .eq('uid', uid)
    .single();

  // credits 字段暂时从订阅状态推算（后续可加专属字段）
  return {
    invite_code: data?.invite_code ?? '',
    is_admin: data?.is_admin ?? false,
    credits: 0,
  };
}

// ─── 登录 ────────────────────────────────────────────────────────────────────
export async function apiLogin(
  email: string,
  password: string,
): Promise<AuthUser> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    // Supabase 错误码映射为中文
    if (error.message.includes('Invalid login credentials')) {
      throw { message: '邮箱或密码错误', code: 401 } as ApiError;
    }
    if (error.message.includes('Email not confirmed')) {
      throw { message: '邮箱尚未验证，请查收验证邮件', code: 403 } as ApiError;
    }
    throw { message: error.message, code: 400 } as ApiError;
  }

  const user = data.user!;
  const session = data.session!;
  const profile = await fetchProfile(user.id);

  return {
    uid: user.id,
    email: user.email!,
    name: user.email!.split('@')[0],
    credits: profile.credits,
    inviteCode: profile.invite_code,
    isAdmin: profile.is_admin,
    token: session.access_token,
  };
}

// ─── 注册 ────────────────────────────────────────────────────────────────────
export async function apiRegister(
  email: string,
  password: string,
  agree: boolean,
  inviteCode?: string,
): Promise<AuthUser & { welcomeCredits: number }> {
  if (!agree) throw { message: '请先同意服务条款', code: 400 } as ApiError;
  if (!PASSWORD_RE.test(password))
    throw { message: '密码需8位以上且包含字母、数字、特殊字符', code: 400 } as ApiError;

  const trimEmail = email.trim().toLowerCase();

  // 邀请码校验（选填）
  let inviterInviteCode: string | undefined;
  if (inviteCode?.trim()) {
    const { data: inviter } = await supabase
      .from('profiles')
      .select('uid')
      .eq('invite_code', inviteCode.trim().toUpperCase())
      .single();
    if (!inviter) throw { message: '邀请码无效', code: 400 } as ApiError;
    inviterInviteCode = inviteCode.trim().toUpperCase();
  }

  const { data, error } = await supabase.auth.signUp({
    email: trimEmail,
    password,
    options: {
      data: { invited_by: inviterInviteCode ?? null },
    },
  });

  if (error) {
    if (error.message.includes('already registered') || error.message.includes('already been registered')) {
      throw { message: '该邮箱已注册，请直接登录', code: 400 } as ApiError;
    }
    throw { message: error.message, code: 400 } as ApiError;
  }

  const user = data.user!;
  const session = data.session;

  // 等待触发器创建 profile（稍作延迟）
  await new Promise(r => setTimeout(r, 500));
  const profile = await fetchProfile(user.id);

  // 赠送7天免费试用订阅
  const welcomeCredits = 5;
  try {
    await activateSubscription(user.id, getFreeTrialPlan());
  } catch (e) {
    console.warn('[注册] 免费试用订阅写入失败', e);
  }

  // 发送欢迎邮件（异步，不阻塞注册流程）
  void fetch('/api/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'welcome',
      to: user.email!,
      name: user.email!.split('@')[0],
    }),
  }).catch(e => console.warn('[注册] 欢迎邮件发送失败', e));

  return {
    uid: user.id,
    email: user.email!,
    name: user.email!.split('@')[0],
    credits: welcomeCredits,
    inviteCode: profile.invite_code,
    isAdmin: false,
    token: session?.access_token ?? '',
    welcomeCredits,
  };
}

// ─── 找回密码：发送重置邮件 ──────────────────────────────────────────────────
export async function apiResetRequest(email: string): Promise<void> {
  const trimEmail = email.trim().toLowerCase();

  // 无论邮箱是否存在都不暴露（防枚举）
  await supabase.auth.resetPasswordForEmail(trimEmail, {
    redirectTo: `${window.location.origin}?reset_token=1`,
  });
}

// ─── 找回密码：用 token 设置新密码 ──────────────────────────────────────────
export async function apiResetConfirm(
  _token: string,
  newPassword: string,
): Promise<void> {
  if (!PASSWORD_RE.test(newPassword))
    throw { message: '密码需8位以上且包含字母、数字、特殊字符', code: 400 } as ApiError;

  // Supabase 通过邮件链接跳转后，session 已自动恢复，直接更新密码即可
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw { message: error.message, code: 400 } as ApiError;
}

// ─── 退出登录 ────────────────────────────────────────────────────────────────
export async function apiLogout(): Promise<void> {
  await supabase.auth.signOut();
}

// ─── 获取当前会话（刷新页面后恢复登录状态） ─────────────────────────────────
export async function apiGetSession(): Promise<AuthUser | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const user = session.user;
  const profile = await fetchProfile(user.id);

  return {
    uid: user.id,
    email: user.email!,
    name: user.email!.split('@')[0],
    credits: profile.credits,
    inviteCode: profile.invite_code,
    isAdmin: profile.is_admin,
    token: session.access_token,
  };
}
