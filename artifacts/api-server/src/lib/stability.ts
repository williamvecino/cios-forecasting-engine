export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function normalizeProbability(value: number): number {
  return round4(clamp(value, 0.0001, 0.9999));
}

export function toPercent(value: number): string {
  return `${(normalizeProbability(value) * 100).toFixed(1)}%`;
}

export function stableJsonStringify(input: unknown): string {
  return JSON.stringify(sortKeysDeep(input));
}

function sortKeysDeep(value: any): any {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (value && typeof value === "object") {
    const sortedKeys = Object.keys(value).sort();
    const out: Record<string, any> = {};
    for (const key of sortedKeys) {
      out[key] = sortKeysDeep(value[key]);
    }
    return out;
  }

  return value;
}

export function deterministicHash(input: unknown): string {
  const str = stableJsonStringify(input);
  let hash = 2166136261;

  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return `H${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false;
  }
  return true;
}
