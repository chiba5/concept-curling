import type { PairScore, Scorer } from './scorer.js';
import { normalizeText } from './scorer.js';

/** 旧実装の demoScore を移植: bigram Jaccard 類似 → 無関係度 0..100 */
export function demoScore(a: string, b: string): number {
  const bi = (s: string): Set<string> => {
    const arr = [...s];
    if (arr.length <= 1) return new Set(arr);
    const out: string[] = [];
    for (let i = 0; i < arr.length - 1; i++) out.push(String(arr[i]) + String(arr[i + 1]));
    return new Set(out);
  };
  const A = bi(normalizeText(a));
  const B = bi(normalizeText(b));
  if (!A.size && !B.size) return 50;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter;
  const sim = inter / (uni || 1);
  return Math.round(100 * (1 - sim));
}

const THEME_POOL = ['断章', '無音帯', '星座', '航海', '茶道', '製本', '氷河', '博物館'];
// 注意: '灯台' はプールに入れない。cpu-game テストは人間の SECRET を '灯台' に固定しており、
// CPU の SECRET が '灯台' を引くと、人間がその CPU を狙った完全一致攻撃が
// friendly fire（attackPairs は自席のライフも対象に含む）で自分の SECRET も破壊してしまう。
export const CONCEPT_POOL = [
  '羊皮紙',
  '炊飯器',
  '季節風',
  '簿記',
  '水平線',
  '風見鶏',
  '燭台',
  '羅針盤',
  '書庫',
  '塩田',
  '活版',
  '喫水',
  '祝祭',
  '油彩',
];

function sample(pool: string[], n: number): string[] {
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j] as string, arr[i] as string];
  }
  return arr.slice(0, n);
}

/** API キー無し・LLM 失敗時のフォールバック採点者。決定的な scorePairs + プール抽選の生成系 */
export class DemoScorer implements Scorer {
  scorePairs(pairs: { a: string; b: string }[]): Promise<PairScore[]> {
    return Promise.resolve(
      pairs.map(({ a, b }) => {
        // 生の bigram Jaccard 距離（0..100、大きいほど無関係）を反転して関連度に変換し [25..85] にリマップする。
        // 無関係語 25×2 テーマ = 50 >= 既定 pickMinTotal(30) → キー無しでも選抜可能、
        // 完全一致 85 は既定 destroyThreshold(70) 以上 → 破壊、無関係 25 は 70 未満で安全。
        const v = 85 - Math.round(demoScore(a, b) * 0.6);
        return { score: v, reason: '簡易採点' };
      }),
    );
  }
  generateThemes(count: number): Promise<string[]> {
    return Promise.resolve(sample(THEME_POOL, count));
  }
  generateConcepts(_themes: string[], n: number, avoid: string[]): Promise<string[]> {
    const avoidSet = new Set(avoid.map((a) => a.trim()));
    const pool = CONCEPT_POOL.filter((c) => !avoidSet.has(c));
    return Promise.resolve(sample(pool, n));
  }
  generateAttack(
    _themes: string[],
    targetConcepts: string[],
    avoid: string[],
    intel?: { ownLives: string[]; clues: unknown[] },
  ): Promise<string> {
    // demo は intel の手掛かりを使わないが、自分のライフと同一語だけは避ける
    const avoidSet = new Set([...avoid, ...(intel?.ownLives ?? [])].map((a) => a.trim()));
    const derive = (base: string): string =>
      base.length >= 2 ? `${base.slice(0, base.length - 1)}装置` : '灯台装置';
    // 対象をシャッフルして avoid に当たらない攻撃語を探す。全滅なら連番で回避
    const bases = sample(
      targetConcepts.length ? targetConcepts : ['灯台'],
      targetConcepts.length || 1,
    );
    for (const base of bases) {
      const cand = derive(base);
      if (!avoidSet.has(cand)) return Promise.resolve(cand);
    }
    const base = derive(bases[0] ?? '灯台');
    for (let k = 2; k < 100; k++) {
      const cand = `${base}${k}`;
      if (!avoidSet.has(cand)) return Promise.resolve(cand);
    }
    return Promise.resolve(base);
  }
}
