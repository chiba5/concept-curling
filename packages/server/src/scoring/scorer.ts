/** スコアの向き: 0 = 無関係 / 100 = 完全一致（一言一句同じ） */
export interface PairScore {
  score: number;
  reason: string;
}

export interface Scorer {
  scorePairs(pairs: { a: string; b: string }[]): Promise<PairScore[]>;
  generateThemes(count: number): Promise<string[]>;
  /** avoid: 生成結果が重複してはいけない既存概念（他プレイヤーの提出済み概念・テーマ語など） */
  generateConcepts(themes: string[], n: number, avoid: string[]): Promise<string[]>;
  /**
   * 相手のライフを「破壊できそうな」攻撃概念を 1 つ返す（CPU 用）。
   * avoid: 使ってはいけない語（過去の攻撃・破壊済み概念・テーマ語。攻撃の繰り返しを防ぐ）
   */
  generateAttack(themes: string[], targetConcepts: string[], avoid: string[]): Promise<string>;
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
