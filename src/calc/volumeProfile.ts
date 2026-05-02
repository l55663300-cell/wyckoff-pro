import { KLine, VolumeProfileNode } from '../types';

export function calcVolumeProfile(klines: KLine[], bins = 40): VolumeProfileNode[] {
  if (klines.length === 0) return [];

  const recent = klines.slice(-Math.min(200, klines.length));
  const highest = Math.max(...recent.map((k) => k.high));
  const lowest = Math.min(...recent.map((k) => k.low));
  const range = highest - lowest;
  if (range === 0) return [];

  const step = range / bins;
  const buckets: number[] = new Array(bins).fill(0);

  for (const k of recent) {
    const idx = Math.min(bins - 1, Math.floor((k.close - lowest) / step));
    buckets[idx] += k.volume;
  }

  const maxVol = Math.max(...buckets);
  const pocIdx = buckets.indexOf(maxVol);
  const totalVol = buckets.reduce((a, b) => a + b, 0);
  const avgVol = totalVol / bins;

  return buckets.map((vol, i) => ({
    priceMin: lowest + i * step,
    priceMax: lowest + (i + 1) * step,
    priceMid: lowest + (i + 0.5) * step,
    volume: vol,
    isPOC: i === pocIdx,
    isLowVolume: vol < avgVol * 0.3,
    percentage: maxVol > 0 ? (vol / maxVol) * 100 : 0,
  }));
}

export function findPOC(profile: VolumeProfileNode[]): VolumeProfileNode | null {
  return profile.find((n) => n.isPOC) ?? null;
}

export function findNearestSupport(profile: VolumeProfileNode[], price: number): number | null {
  const belowPOC = profile.filter((n) => n.isPOC || n.percentage > 60).filter((n) => n.priceMid < price);
  if (belowPOC.length === 0) return null;
  return belowPOC[belowPOC.length - 1].priceMid;
}

export function findNearestResistance(profile: VolumeProfileNode[], price: number): number | null {
  const abovePOC = profile.filter((n) => n.isPOC || n.percentage > 60).filter((n) => n.priceMid > price);
  if (abovePOC.length === 0) return null;
  return abovePOC[0].priceMid;
}
