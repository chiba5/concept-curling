import { clampScore, type PairScore } from './scorer.js';

export interface OpenAIOptions {
  apiKey: string;
  model: string;
  temperature: number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

const SCORE_SYSTEM = `あなたは概念間の無関係度を厳密に数値化する審判。
出力は必ずJSONのみ。
採点規則:
- 各ペアに 0〜100 の整数score と、20字以内の日本語 reason。
- 0=極めて深い関連, 100=極めて浅い。
- 「不明・判断困難」は 45〜60 の中域を用い、安易に80〜100へ逃げない。
- 同義/極近: 0〜15、中距離: 40〜60、別領域: 75〜95 を目安。
- 短語でも、想定される文脈・分野の重なり（学術/文化/日常）を積極的に推定する。`;

const THEME_SYSTEM = `あなたは抽象と具象をバランスよく提示するキュレーター。
出力は必ずJSONのみ。日本語で、意味の離れた短いテーマを毎回変えて生成する。`;

const CONCEPT_SYSTEM = `あなたは連想ゲームのプレイヤー。出力は必ずJSONのみ。
与えられたテーマ群と「深すぎず浅すぎない中距離」の関連を持つ日本語の短い概念を生成する。`;

const ATTACK_SYSTEM = `あなたは連想ゲームの攻撃者。出力は必ずJSONのみ。
対象概念のどれかと「中程度の関連（同義ではないが明確に繋がる）」を持つ日本語の短い概念を1つ生成する。`;

/** OpenAI Chat Completions を fetch 直叩き。失敗・不正形は throw（穴埋めは ResilientScorer の責務） */
export class OpenAIScorer {
  constructor(private readonly opts: OpenAIOptions) {}

  private async callJson(system: string, user: string): Promise<unknown> {
    const { apiKey, model, temperature, timeoutMs = 15000, fetchFn = fetch } = this.opts;
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetchFn('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            temperature,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        return JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
      } catch (e) {
        lastError = e;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /** 添字→PairScore の疎な Map を返す（欠損の穴埋めは呼び出し側） */
  async scorePairs(pairs: { a: string; b: string }[]): Promise<Map<number, PairScore>> {
    const user = `採点対象のペア配列:
${JSON.stringify(pairs.map((p, i) => ({ i, a: p.a, b: p.b })))}

出力フォーマット（厳守）:
{"pairs":[{"i":番号,"score":整数0-100,"reason":"20字以内"}...]}`;
    const json = (await this.callJson(SCORE_SYSTEM, user)) as {
      pairs?: { i?: number; score?: number; reason?: string }[];
    };
    const out = new Map<number, PairScore>();
    for (const item of json.pairs ?? []) {
      if (
        typeof item?.i === 'number' &&
        typeof item?.score === 'number' &&
        item.i >= 0 &&
        item.i < pairs.length
      ) {
        out.set(item.i, { score: clampScore(item.score), reason: String(item.reason ?? '') });
      }
    }
    return out;
  }

  async generateThemes(count: number): Promise<string[]> {
    const user = `要件:
- 日本語テーマを ${count} 個。長さ1〜6文字程度の短い名詞や造語。
- 抽象/具象が混在し、互いに離れすぎず近すぎない中距離感。
- 一般的な文脈で連想可能なもの。専門的すぎる語は避ける。
出力: {"themes":["テーマ1", ...]}`;
    const json = (await this.callJson(THEME_SYSTEM, user)) as { themes?: unknown };
    const arr = Array.isArray(json.themes) ? json.themes : [];
    const themes = arr.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    if (themes.length !== count || new Set(themes).size !== count)
      throw new Error('invalid themes response');
    return themes.map((t) => t.trim());
  }

  async generateConcepts(themes: string[], n: number): Promise<string[]> {
    const user = `テーマ: ${JSON.stringify(themes)}
要件: 各テーマと中距離の関連を持つ日本語の概念（20字以内）を ${n} 個、重複なしで。
出力: {"concepts":["概念1", ...]}`;
    const json = (await this.callJson(CONCEPT_SYSTEM, user)) as { concepts?: unknown };
    const arr = Array.isArray(json.concepts) ? json.concepts : [];
    return arr.filter((x): x is string => typeof x === 'string');
  }

  async generateAttack(themes: string[], targetConcepts: string[]): Promise<string> {
    const user = `テーマ: ${JSON.stringify(themes)}
対象概念: ${JSON.stringify(targetConcepts)}
要件: 対象概念のどれかと中程度の関連を持つ攻撃概念を 1 つ（20字以内）。
出力: {"attack":"概念"}`;
    const json = (await this.callJson(ATTACK_SYSTEM, user)) as { attack?: unknown };
    if (typeof json.attack !== 'string' || !json.attack.trim()) throw new Error('invalid attack');
    return json.attack.trim();
  }
}
