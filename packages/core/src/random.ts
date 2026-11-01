/**
 * Deterministic pseudo-random helpers.
 *
 * Obfuscated bundles must be reproducible: the same source and the same seed
 * must always produce the same identifiers, or every build looks dirty.
 */

/** FNV-1a 32-bit hash. Stable across platforms and Node versions. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

export interface SeededRandom {
  /** Next unsigned 32-bit integer. */
  next(): number;
  /** Integer in `[0, maxExclusive)`. */
  int(maxExclusive: number): number;
  /** In-place Fisher-Yates shuffle. */
  shuffle<T>(items: T[]): T[];
  /** Lowercase hex string of exactly `length` characters. */
  hex(length: number): string;
}

/** sfc32 seeded generator. Small, fast, and stable across platforms. */
export function createRandom(seed: string | number): SeededRandom {
  const base = typeof seed === "number" ? seed >>> 0 : hashString(String(seed));
  let a = base;
  let b = hashString(`${base}:b`);
  let c = hashString(`${base}:c`);
  let d = (1 + (hashString(`${base}:d`) % 0xfffffffe)) >>> 0;

  const next = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;

    let t = (a + b) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    d = (d + 1) >>> 0;
    t = (t + d) >>> 0;
    c = (c + t) >>> 0;

    return t >>> 0;
  };

  for (let index = 0; index < 12; index += 1) {
    next();
  }

  return {
    next,
    int(maxExclusive) {
      return maxExclusive <= 0 ? 0 : next() % maxExclusive;
    },
    shuffle<T>(items: T[]) {
      for (let index = items.length - 1; index > 0; index -= 1) {
        const swap = next() % (index + 1);
        const value = items[index] as T;
        items[index] = items[swap] as T;
        items[swap] = value;
      }

      return items;
    },
    hex(length) {
      let out = "";

      while (out.length < length) {
        out += next().toString(16).padStart(8, "0");
      }

      return out.slice(0, length);
    },
  };
}
