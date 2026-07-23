/** スコアの向き: 0 = 極めて深い関連 / 100 = 極めて浅い（無関係） */
export interface PairScore {
  score: number;
  reason: string;
}

export interface Scorer {
  scorePairs(pairs: { a: string; b: string }[]): Promise<PairScore[]>;
  generateThemes(count: number): Promise<string[]>;
  generateConcepts(themes: string[], n: number): Promise<string[]>;
  /** 相手の公開ライフに「破壊帯に入りそうな」攻撃概念を 1 つ返す（CPU 用） */
  generateAttack(themes: string[], targetConcepts: string[]): Promise<string>;
}

/** エンジンに渡す前の最終防衛線: 常に有限な 0..100 の整数へ */
export function clampScore(v: number): number {
  if (!Number.isFinite(v)) return 50;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function normalizeText(s: string): string {
  return String(s ?? '')
    .trim()
    .toLowerCase();
}

export function pairKey(provider: string, model: string, a: string, b: string): string {
  return `${provider}|${model}|${normalizeText(a)}|${normalizeText(b)}`;
}
