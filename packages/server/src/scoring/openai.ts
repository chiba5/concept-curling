import { clampScore, type PairScore } from './scorer.js';

export interface OpenAIOptions {
  apiKey: string;
  model: string;
  temperature: number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

const SCORE_SYSTEM = `あなたは概念間の関連度を厳密に数値化する審判。出力は必ずJSONのみ。
採点規則:
- 各ペアに 0〜100 の整数 score と 20 字以内の日本語 reason。
- 0=完全に無関係、100=一言一句同一。数値が高いほど関連が深い。
- 目安: 同一語 100 / ほぼ同一文脈 95〜99（例: 魔法とハリーポッター 98）/ 同分野の強い連想 85〜94（例: 魔法とドラクエ 90）/ 明確な連想 55〜80 / 弱い連想 30〜54 / ほぼ無関係 0〜29。
- 「不明・判断困難」は 40〜55 の中域を用いる。`;

const THEME_SYSTEM = `あなたは抽象と具象をバランスよく提示するキュレーター。
出力は必ずJSONのみ。日本語で、意味の離れた短いテーマを毎回変えて生成する。`;

// テーマの多様性を構造的に担保するジャンル一覧。毎回ここからランダム抽選してプロンプトに指定する
// （採点は temperature 0.2 の決定性が欲しいが、同じ理由で生成系は同じ語ばかり返すため）
const THEME_GENRES = [
  '自然現象',
  '道具',
  '感情',
  '場所',
  '食',
  '音楽',
  '動物',
  '植物',
  '天体',
  '職業',
  '遊び',
  '乗り物',
  '時間・季節',
  '身体',
  '色彩',
  '学問',
  '神話・伝承',
  '日常の習慣',
  '芸術',
  '光と影',
];

/** 生成系（テーマ・概念・攻撃）用の温度。採点用の低温設定とは分離する */
const GENERATION_TEMPERATURE = 1.0;

function sampleGenres(count: number): string[] {
  const arr = [...THEME_GENRES];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j] as string, arr[i] as string];
  }
  return arr.slice(0, Math.min(count, arr.length));
}

const CONCEPT_SYSTEM = `あなたは連想ゲームの熟練プレイヤー。出力は必ずJSONのみ。
目的: 各テーマと「深すぎず浅すぎない中距離」の関連（関連度 40〜60 目安）を持つ概念を出す。
厳守:
- テーマの語やその一部を含む語・複合語は禁止（例: テーマ「夢」に「夢日記」「夢の中の風船」は不可）
- 独立した短い名詞 1 語（1〜6 文字程度）
- 同義語・直接の上位下位語ではなく、1〜2 ホップの間接連想にする
  （例: 「夢」→「宇宙」「枕」「予知」／「風船」→「誕生日」「ヘリウム」「浮力」）
- 与えられた禁止語（使用不可）と同じ・似た語は避ける`;

const ATTACK_SYSTEM = `あなたは連想ゲームの攻撃者。出力は必ずJSONのみ。
対象概念のどれかと「中程度以上の関連（関連度 51 以上を狙う。同義・包含ではなく連想でつながる）」を持つ
独立した短い名詞 1 語を生成する。対象概念の語やその一部を含む複合語は禁止。`;

/** OpenAI Chat Completions を fetch 直叩き。失敗・不正形は throw（穴埋めは ResilientScorer の責務） */
export class OpenAIScorer {
  constructor(private readonly opts: OpenAIOptions) {}

  private async callJson(
    system: string,
    user: string,
    temperature = this.opts.temperature,
  ): Promise<unknown> {
    const { apiKey, model, timeoutMs = 15000, fetchFn = fetch } = this.opts;
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
    const genres = sampleGenres(count);
    const user = `要件:
- 日本語テーマを ${count} 個。長さ1〜6文字程度の短い名詞や造語。
- 各テーマはそれぞれ次のジャンルから 1 つずつ発想する: ${JSON.stringify(genres)}
- 抽象/具象が混在し、互いに離れすぎず近すぎない中距離感。
- 一般的な文脈で連想可能なもの。専門的すぎる語は避ける。ジャンル名そのものは使わない。
出力: {"themes":["テーマ1", ...]}`;
    const json = (await this.callJson(THEME_SYSTEM, user, GENERATION_TEMPERATURE)) as {
      themes?: unknown;
    };
    const arr = Array.isArray(json.themes) ? json.themes : [];
    const themes = arr.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    if (themes.length !== count || new Set(themes).size !== count)
      throw new Error('invalid themes response');
    return themes.map((t) => t.trim());
  }

  async generateConcepts(themes: string[], n: number, avoid: string[]): Promise<string[]> {
    const user = `テーマ: ${JSON.stringify(themes)}
禁止語（使用不可）: ${JSON.stringify(avoid)}
要件: 上記の厳守事項に従い、各テーマと中距離の関連を持つ独立した概念を ${n} 個、重複なしで。
出力: {"concepts":["概念1", ...]}`;
    const json = (await this.callJson(CONCEPT_SYSTEM, user, GENERATION_TEMPERATURE)) as {
      concepts?: unknown;
    };
    const arr = Array.isArray(json.concepts) ? json.concepts : [];
    return arr.filter((x): x is string => typeof x === 'string');
  }

  async generateAttack(themes: string[], targetConcepts: string[]): Promise<string> {
    const user = `テーマ: ${JSON.stringify(themes)}
対象概念: ${JSON.stringify(targetConcepts)}
要件: 対象概念のどれかと中程度の関連を持つ攻撃概念を 1 つ（20字以内）。
出力: {"attack":"概念"}`;
    const json = (await this.callJson(ATTACK_SYSTEM, user, GENERATION_TEMPERATURE)) as {
      attack?: unknown;
    };
    if (typeof json.attack !== 'string' || !json.attack.trim()) throw new Error('invalid attack');
    return json.attack.trim();
  }
}
