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
const CONCEPT_POOL = [
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
      pairs.map(({ a, b }) => ({ score: demoScore(a, b), reason: '簡易採点' })),
    );
  }
  generateThemes(count: number): Promise<string[]> {
    return Promise.resolve(sample(THEME_POOL, count));
  }
  generateConcepts(_themes: string[], n: number): Promise<string[]> {
    return Promise.resolve(sample(CONCEPT_POOL, n));
  }
  generateAttack(_themes: string[], targetConcepts: string[]): Promise<string> {
    const base = targetConcepts[Math.floor(Math.random() * targetConcepts.length)] ?? '灯台';
    return Promise.resolve(base.length >= 2 ? `${base.slice(0, base.length - 1)}装置` : '灯台装置');
  }
}
