import { MAX_CONCEPT_LENGTH } from '@concept-curling/shared';
import { LruCache } from './cache.js';
import { DemoScorer } from './demo.js';
import { OpenAIScorer } from './openai.js';
import { pairKey, type PairScore, type Scorer } from './scorer.js';

const CACHE_MAX = 5000;

/** primary 失敗の原因をログに残す（err.message のみ。キー等の秘密情報は含まれない） */
function logPrimaryFailure(method: string, e: unknown): void {
  const message = e instanceof Error ? e.message : String(e);
  console.warn(`[scoring] primary ${method} failed, falling back to demo: ${message}`);
}

/** primary（無ければ demo 単独）+ LRU キャッシュ + demo 穴埋め。どのメソッドも reject しない */
export class ResilientScorer implements Scorer {
  private cache = new LruCache<PairScore>(CACHE_MAX);

  constructor(
    private readonly primary: OpenAIScorer | null,
    private readonly demo: DemoScorer,
    private readonly meta: { provider: string; model: string },
  ) {}

  get providerName(): string {
    return this.meta.provider;
  }

  async scorePairs(pairs: { a: string; b: string }[]): Promise<PairScore[]> {
    const results = new Array<PairScore | null>(pairs.length).fill(null);
    const ask: number[] = [];
    pairs.forEach((p, i) => {
      const hit = this.cache.get(pairKey(this.meta.provider, this.meta.model, p.a, p.b));
      if (hit) results[i] = hit;
      else ask.push(i);
    });
    if (ask.length && this.primary) {
      try {
        const sparse = await this.primary.scorePairs(
          ask.map((i) => pairs[i] as { a: string; b: string }),
        );
        ask.forEach((origIdx, k) => {
          const hit = sparse.get(k);
          if (hit) results[origIdx] = hit;
        });
      } catch (e) {
        // 全滅 → demo 穴埋めに任せる（原因はログへ。秘密情報は含まれない）
        logPrimaryFailure('scorePairs', e);
      }
    }
    const missing = results.flatMap((r, i) => (r === null ? [i] : []));
    if (missing.length) {
      const demoScores = await this.demo.scorePairs(
        missing.map((i) => pairs[i] as { a: string; b: string }),
      );
      missing.forEach((origIdx, k) => {
        results[origIdx] = demoScores[k] ?? { score: 50, reason: '簡易採点' };
      });
    }
    results.forEach((r, i) => {
      if (this.primary && missing.includes(i)) return;
      const p = pairs[i];
      if (r && p) this.cache.set(pairKey(this.meta.provider, this.meta.model, p.a, p.b), r);
    });
    return results as PairScore[];
  }

  async generateThemes(count: number): Promise<string[]> {
    if (this.primary) {
      try {
        return await this.primary.generateThemes(count);
      } catch (e) {
        logPrimaryFailure('generateThemes', e);
      }
    }
    return this.demo.generateThemes(count);
  }

  async generateConcepts(themes: string[], n: number): Promise<string[]> {
    let raw: string[] = [];
    if (this.primary) {
      try {
        raw = await this.primary.generateConcepts(themes, n);
      } catch (e) {
        logPrimaryFailure('generateConcepts', e);
        raw = [];
      }
    }
    // 正規化: trim・長さ制限・重複除去。不足分は demo プールから補充（エンジン検証を必ず通る形にする）
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of raw) {
      const t = c.trim().slice(0, MAX_CONCEPT_LENGTH);
      if (t && !seen.has(t)) {
        seen.add(t);
        out.push(t);
        if (out.length === n) return out;
      }
    }
    const fill = await this.demo.generateConcepts(themes, n + out.length);
    for (const c of fill) {
      if (!seen.has(c)) {
        seen.add(c);
        out.push(c);
        if (out.length === n) break;
      }
    }
    return out.slice(0, n);
  }

  async generateAttack(themes: string[], targetConcepts: string[]): Promise<string> {
    if (this.primary) {
      try {
        const a = (await this.primary.generateAttack(themes, targetConcepts)).trim();
        if (a) return a.slice(0, MAX_CONCEPT_LENGTH);
      } catch (e) {
        logPrimaryFailure('generateAttack', e);
      }
    }
    return this.demo.generateAttack(themes, targetConcepts);
  }
}

export interface ScorerEnv {
  SCORING_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_TEMPERATURE?: string;
}

export function createScorerFromEnv(env: ScorerEnv): ResilientScorer {
  const clean = (v: string | undefined): string | undefined => {
    const t = v?.trim();
    return t ? t : undefined;
  };
  const provider = clean(env.SCORING_PROVIDER) ?? (clean(env.OPENAI_API_KEY) ? 'openai' : 'demo');
  const model = clean(env.OPENAI_MODEL) ?? 'gpt-4o-mini';
  const apiKey = clean(env.OPENAI_API_KEY);
  if (provider === 'openai' && apiKey) {
    const parsed = Number.parseFloat(clean(env.OPENAI_TEMPERATURE) ?? '0.2');
    const primary = new OpenAIScorer({
      apiKey,
      model,
      temperature: Number.isFinite(parsed) ? parsed : 0.2,
    });
    return new ResilientScorer(primary, new DemoScorer(), { provider: 'openai', model });
  }
  return new ResilientScorer(null, new DemoScorer(), { provider: 'demo', model: 'demo' });
}
