import prand from 'pure-rand';

/**
 * 确定性 32 位哈希混合函数（FNV-1a 变体），用于由 (worldSeed, domain, scopeId, attemptIndex)
 * 派生互不干扰的子流种子，严禁依赖 Math.random() 或墙钟时间。
 */
export function deriveStreamSeed(
  worldSeed: number,
  domain: string,
  scopeId: string,
  attemptIndex: number,
): number {
  const input = `${worldSeed}|${domain}|${scopeId}|${attemptIndex}`;
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  // 额外雪崩混淆，确保邻近整数种子也生成正交子流
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;
  return (h1 >>> 0) || 1;
}

export interface DeterministicRng {
  readonly seed: number;
  nextInt(minInclusive: number, maxInclusive: number): number;
  nextFloat(): number;
  pick<T>(items: readonly T[]): T;
  pickWeighted<T>(items: readonly T[], getWeight: (item: T) => number): T;
  shuffle<T>(items: readonly T[]): T[];
}

export function createStreamRng(
  worldSeed: number,
  domain: string,
  scopeId: string,
  attemptIndex = 0,
): DeterministicRng {
  const streamSeed = deriveStreamSeed(worldSeed, domain, scopeId, attemptIndex);
  let gen = prand.xoroshiro128plus(streamSeed);

  const nextInt = (minInclusive: number, maxInclusive: number): number => {
    if (maxInclusive < minInclusive) {
      throw new RangeError(`Invalid range [${minInclusive}, ${maxInclusive}]`);
    }
    const [val, nextGen] = prand.uniformIntDistribution(minInclusive, maxInclusive, gen);
    gen = nextGen;
    return val;
  };

  const nextFloat = (): number => {
    const val = nextInt(0, 999_999) / 1_000_000;
    return val;
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new RangeError('Cannot pick from empty array');
    }
    return items[nextInt(0, items.length - 1)];
  };

  const pickWeighted = <T>(items: readonly T[], getWeight: (item: T) => number): T => {
    if (items.length === 0) {
      throw new RangeError('Cannot pickWeighted from empty array');
    }
    const weights = items.map((item) => Math.max(0, Math.round(getWeight(item) * 1000)));
    const total = weights.reduce((acc, w) => acc + w, 0);
    if (total <= 0) {
      return items[0];
    }
    const roll = nextInt(1, total);
    let cumulative = 0;
    for (let i = 0; i < items.length; i += 1) {
      cumulative += weights[i];
      if (roll <= cumulative) {
        return items[i];
      }
    }
    return items[items.length - 1];
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = nextInt(0, i);
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  };

  return {
    seed: streamSeed,
    nextInt,
    nextFloat,
    pick,
    pickWeighted,
    shuffle,
  };
}

/** 锁定测试向量：若 PRNG 算法或混洗被改动，单元测试将立刻捕获 */
export const PRNG_LOCKED_VECTOR = {
  worldSeed: 20261123,
  domain: 'vector-check',
  scopeId: 'baseline',
  attemptIndex: 0,
  expectedInts: [82, 91, 68, 90, 84],
} as const;
