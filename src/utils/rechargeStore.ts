/**
 * rechargeStore — 充值申请（按量包）数据层
 * v2: 全面迁到 Supabase recharge_orders 表
 *     - 用户提交：写 Supabase（RLS 限制只能插入自己的行）
 *     - 管理员审核：写 Supabase（RLS 限制只有 is_admin=true 的用户可 UPDATE）
 *     - 读取：从 Supabase 查询，不再依赖 localStorage
 */

import { supabase } from '../lib/supabase';

export type RechargeStatus = 'pending' | 'approved' | 'rejected';
export type PayMethod = 'wechat' | 'alipay' | 'usdt';

export interface RechargeOrder {
  id: string;
  uid: string;
  email: string;
  packLabel: string;
  count: number;
  price: number;
  payMethod: PayMethod;
  status: RechargeStatus;
  createdAt: string;
  reviewedAt?: string;
  remark?: string;
}

function rowToOrder(row: Record<string, unknown>): RechargeOrder {
  return {
    id: row.id as string,
    uid: row.uid as string,
    email: row.email as string,
    packLabel: row.pack_label as string,
    count: Number(row.count),
    price: Number(row.price),
    payMethod: row.pay_method as PayMethod,
    status: row.status as RechargeStatus,
    createdAt: row.created_at as string,
    reviewedAt: row.reviewed_at as string | undefined,
    remark: row.remark as string | undefined,
  };
}

/** 新建充值申请（用户提交） */
export async function submitOrder(
  user: { uid: string; email: string },
  pack: { label: string; count: number; price: number },
  payMethod: PayMethod,
): Promise<RechargeOrder> {
  const id = `R${Date.now()}`;
  const { data, error } = await supabase
    .from('recharge_orders')
    .insert({
      id,
      uid: user.uid,
      email: user.email,
      pack_label: pack.label,
      count: pack.count,
      price: pack.price,
      pay_method: payMethod,
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw new Error('提交充值申请失败：' + error.message);
  return rowToOrder(data as Record<string, unknown>);
}

/** 加载所有充值订单（管理员用，RLS 确保只有管理员能查到全部） */
export async function loadOrders(): Promise<RechargeOrder[]> {
  const { data, error } = await supabase
    .from('recharge_orders')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[rechargeStore] loadOrders 失败:', error.message);
    return [];
  }
  return (data as Record<string, unknown>[]).map(rowToOrder);
}

/** 获取待审核订单 */
export async function getPendingOrders(): Promise<RechargeOrder[]> {
  const { data, error } = await supabase
    .from('recharge_orders')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as Record<string, unknown>[]).map(rowToOrder);
}

/** 审核通过（管理员，RLS 限制 is_admin=true 才能执行） */
export async function approveOrder(id: string, remark?: string): Promise<RechargeOrder | null> {
  const { data, error } = await supabase
    .from('recharge_orders')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      remark: remark ?? null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('[rechargeStore] approveOrder 失败:', error.message);
    return null;
  }
  return rowToOrder(data as Record<string, unknown>);
}

/** 审核拒绝（管理员） */
export async function rejectOrder(id: string, remark?: string): Promise<RechargeOrder | null> {
  const { data, error } = await supabase
    .from('recharge_orders')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      remark: remark ?? null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('[rechargeStore] rejectOrder 失败:', error.message);
    return null;
  }
  return rowToOrder(data as Record<string, unknown>);
}

/** 获取当前用户自己的充值记录 */
export async function getUserOrders(uid: string): Promise<RechargeOrder[]> {
  const { data, error } = await supabase
    .from('recharge_orders')
    .select('*')
    .eq('uid', uid)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as Record<string, unknown>[]).map(rowToOrder);
}

export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  wechat: '微信转账',
  alipay: '支付宝',
  usdt:   'USDT TRC20',
};
