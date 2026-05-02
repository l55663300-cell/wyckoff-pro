/** 充值申请本地存储工具（前端模拟，待接入真实后端时替换为 API 调用） */

export type RechargeStatus = 'pending' | 'approved' | 'rejected';
export type PayMethod = 'wechat' | 'alipay' | 'usdt';

export interface RechargeOrder {
  id: string;          // 唯一订单ID
  uid: string;         // 用户ID
  email: string;       // 用户邮箱（也是转账备注）
  packLabel: string;   // 套餐名称，如"100次按量包"
  count: number;       // 购买次数
  price: number;       // 金额（元）
  payMethod: PayMethod;
  status: RechargeStatus;
  createdAt: string;   // ISO 时间字符串
  reviewedAt?: string; // 审核时间
  remark?: string;     // 管理员备注
}

const LS_KEY = 'wyckoff_recharge_orders';

export function loadOrders(): RechargeOrder[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as RechargeOrder[]) : [];
  } catch { return []; }
}

function saveOrders(orders: RechargeOrder[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(orders));
}

/** 新建充值申请（用户提交时调用） */
export function submitOrder(
  user: { uid: string; email: string },
  pack: { label: string; count: number; price: number },
  payMethod: PayMethod,
): RechargeOrder {
  const order: RechargeOrder = {
    id: `R${Date.now()}`,
    uid: user.uid,
    email: user.email,
    packLabel: pack.label,
    count: pack.count,
    price: pack.price,
    payMethod,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  const orders = loadOrders();
  orders.unshift(order);
  saveOrders(orders);
  return order;
}

/** 审核通过（后台调用，返回更新后的订单） */
export function approveOrder(id: string, remark?: string): RechargeOrder | null {
  const orders = loadOrders();
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return null;
  orders[idx] = {
    ...orders[idx],
    status: 'approved',
    reviewedAt: new Date().toISOString(),
    remark,
  };
  saveOrders(orders);
  return orders[idx];
}

/** 审核拒绝 */
export function rejectOrder(id: string, remark?: string): RechargeOrder | null {
  const orders = loadOrders();
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return null;
  orders[idx] = {
    ...orders[idx],
    status: 'rejected',
    reviewedAt: new Date().toISOString(),
    remark,
  };
  saveOrders(orders);
  return orders[idx];
}

/** 获取待审核列表 */
export function getPendingOrders(): RechargeOrder[] {
  return loadOrders().filter(o => o.status === 'pending');
}

/** 获取所有订单 */
export function getAllOrders(): RechargeOrder[] {
  return loadOrders();
}

export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  wechat: '微信转账',
  alipay: '支付宝',
  usdt:   'USDT TRC20',
};
