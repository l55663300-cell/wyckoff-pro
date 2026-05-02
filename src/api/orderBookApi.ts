import axios from 'axios';

export interface OrderBookLevel {
  price: number;
  quantity: number;
  total: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export async function fetchOrderBook(
  symbol: string,
  limit: number = 50
): Promise<OrderBook> {
  const response = await axios.get(
    `/api/fapi/fapi/v1/depth`,
    { params: { symbol, limit } }
  );

  const data = response.data;

  let bidTotal = 0;
  const bids: OrderBookLevel[] = data.bids.map(([price, qty]: [string, string]) => {
    const p = parseFloat(price);
    const q = parseFloat(qty);
    bidTotal += q;
    return { price: p, quantity: q, total: bidTotal };
  });

  let askTotal = 0;
  const asks: OrderBookLevel[] = data.asks.map(([price, qty]: [string, string]) => {
    const p = parseFloat(price);
    const q = parseFloat(qty);
    askTotal += q;
    return { price: p, quantity: q, total: askTotal };
  });

  return { bids, asks, timestamp: Date.now() };
}

export function detectBigWalls(
  orderBook: OrderBook,
  threshold: number = 2.0
): {
  bidWalls: { price: number; quantity: number }[];
  askWalls: { price: number; quantity: number }[];
} {
  const avgBidQty = orderBook.bids.reduce((sum, b) => sum + b.quantity, 0) / (orderBook.bids.length || 1);
  const avgAskQty = orderBook.asks.reduce((sum, a) => sum + a.quantity, 0) / (orderBook.asks.length || 1);

  const bidWalls = orderBook.bids
    .filter((b) => b.quantity > avgBidQty * threshold)
    .map((b) => ({ price: b.price, quantity: b.quantity }));

  const askWalls = orderBook.asks
    .filter((a) => a.quantity > avgAskQty * threshold)
    .map((a) => ({ price: a.price, quantity: a.quantity }));

  return { bidWalls, askWalls };
}
