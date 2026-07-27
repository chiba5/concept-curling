import { clampScore, type PairScore } from './scorer.js';

export interface OpenAIOptions {
  apiKey: string;
  /** 採点用モデル（呼び出し回数・トークン量が多い側。安いモデルを充てる） */
  model: string;
  /** 生成・推理用モデル（テーマ・概念・仮説・攻撃。賢いモデルを充てる）。省略時は model と同一 */
  generationModel?: string;
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

const THEME_SYSTEM = `あなたは連想ゲームの出題者。出力は必ずJSONのみ。
テーマは「誰でも知っている言葉」だけを使う:
- 義務教育で習う語なら多少専門的でも可（例: 光合成、磁石、蒸発、台風）
- 誰でも知る有名なゲーム・アニメ・童話などの固有名詞も可（例: マリオ、ドラえもん、桃太郎）
- 造語・文学的な複合語・稀な動植物名・専門用語は不可（例: 樹影、無音帯、カラスウリ、筆触 は不可）
- モノ（物体）や現象を中心に選ぶ。感情などの抽象概念はテーマ全体の半分まで
日本語で、意味の離れた短いテーマを毎回変えて生成する。`;

// テーマの多様性を構造的に担保するジャンル一覧。毎回ここからランダム抽選してプロンプトに指定する
// （採点は temperature 0.2 の決定性が欲しいが、同じ理由で生成系は同じ語ばかり返すため）。
// モノ・現象中心（本人指示）。誰でも知る語しか出ないよう、紛れやすいジャンルには例を添える
const THEME_GENRES = [
  '自然現象（雨・虹・雷など）',
  '天気・季節',
  '動物（誰でも知るもの）',
  '植物（誰でも知るもの）',
  '食べ物',
  '飲み物',
  '乗り物',
  '道具・家電',
  '文房具',
  'スポーツ',
  '楽器',
  '身体',
  '天体・宇宙',
  '場所・建物',
  '職業',
  '有名なゲーム作品・キャラクター',
  '有名なアニメ・マンガ',
  '昔話・童話',
  '学校生活',
  '祭り・行事',
  '色・光',
  '音',
  'おもちゃ・遊び',
  '衣服',
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
このゲームでは、テーマから相手に推測されない概念をライフに選んだ側が生き残る。
目的: 各テーマと「関連はあるが推測されにくい」概念（各テーマと関連度 25〜40 目安。合計が選抜下限を
わずかに超える“遠さ”が理想 — 近いほど相手に当てられる。どれかのテーマと 60 以上になる直接的な語は不可）を出す。
厳守:
- 同義語・類義語・直接連想は禁止（例: テーマ「寂しさ」に「孤独」「孤立」は不可 — 一発で当てられる）
- テーマの語やその一部を含む語・複合語は禁止（例: テーマ「夢」に「夢日記」は不可）
- 2 ホップの意外な連想へ飛ばす。突飛だが説明されれば繋がる語が理想
  （例: 「寂しさ」→「留守番電話」「深夜ラジオ」「消灯」／「夢」→「枕」「宇宙」／「風船」→「ヘリウム」「浮力」）
- 生成する概念どうしは互いに離れた領域から出し、相互の関連度も低く保つ
  （1 つの攻撃語で複数の概念が同時に壊されないための分散）
- 独立した短い名詞 1 語（1〜6 文字程度）
- 与えられた禁止語（使用不可）と同じ・似た語は避ける`;

const HYPO_SYSTEM = `あなたは連想ゲームの推理役。出力は必ずJSONのみ。
相手はテーマから「関連はあるが直接的でない」概念を秘密のライフとして置いている。
過去の攻撃語とその関連度（0-100）が手掛かり。温度で読む:
60以上=熱い（その攻撃語のすぐ近くに正解がある）/ 40〜59=ぬるい（大きな領域は合っているが具体物が違う）/ 39以下=冷たい（その領域に正解は無い）。
厳守:
- 推測は必ず具体的な名詞（物・現象・作品・場所・行為などの具体物）。「自然」「文化」「旅」「芸術」のような
  広いカテゴリ語は、正解のすぐ近くでも関連度が 70 に届かず破壊できないため禁止
- 熱い手掛かりがあれば最優先: その攻撃語の近傍・言い換え・部分/全体にあたる具体物を出す
- ぬるい手掛かりしか無ければ: その攻撃語と同じ大領域の中の「異なる具体物」を列挙して掘り下げる
- 冷たい手掛かりと同じ領域・同じ系統の推測は出さない（除外推論。外れた領域を掘り続けない）
- 手掛かりが無い・全て冷たい場合は偵察: まだ試されていない互いに離れた複数の領域から、
  人間がテーマから連想して選びがちな具体物を広く出す（次の手掛かりを作るための領域の切り分け）
- 独立した短い名詞 1 語、重複なし。禁止語と同じ・似た語は出さない
出力: {"guesses":["概念1", ...]}`;

const ATTACK_SYSTEM = `あなたは連想ゲームの攻撃者。出力は必ずJSONのみ。
状況: 相手はテーマから連想した概念を非公開のライフとして持っている。攻撃概念との関連度が高いと破壊できる。
攻撃は自分のライフにも当たる（friendly fire）。
目的: 相手が選んでいそうな概念を推測し、それに強い関連（同義・包含ではなく連想）で当たる攻撃を 1 つ出す。
厳守:
- 最重要: 「自分のライフ」と関連の高い語は絶対に出さない（同義・類義・強い連想も不可。自分が削れる）
- 「手掛かり」があれば最優先で使う: 相手の各 秘ライフについて過去の攻撃語との関連度が並ぶ。
  60 前後なら惜しい（その攻撃語の近くに相手の概念がある）、20 以下なら遠い。
  関連度が高かった攻撃語の周辺で、まだ試していない別角度の語を出して詰める
- 公開された対象概念があればそのどれかへの命中も狙える
- 手掛かりが無い初手は、相手が選びそうな中距離連想語（例: テーマ「夢」なら「枕」「宇宙」）を想定して狙う
- 攻撃は具体的な名詞で出す。「自然」「文化」「旅」のような広いカテゴリ語は関連度が 30〜50 で頭打ちになり破壊圏（70）に届かない
- 禁止語（過去の攻撃・破壊済み概念・テーマ語）と同じ・ほぼ同じ語は使わない。毎ターン別の角度から攻める
- 独立した短い名詞 1 語（20 字以内）。対象概念の語やその一部を含む複合語は禁止`;

/** OpenAI Chat Completions を fetch 直叩き。失敗・不正形は throw（穴埋めは ResilientScorer の責務） */
export class OpenAIScorer {
  constructor(private readonly opts: OpenAIOptions) {}

  private async callJson(
    system: string,
    user: string,
    temperature = this.opts.temperature,
    model = this.opts.model,
  ): Promise<unknown> {
    const { apiKey, timeoutMs = 15000, fetchFn = fetch } = this.opts;
    let lastError: unknown;
    // GPT-5 系は reasoning 有効時に temperature を 400 で拒否する。互換性が読めないため、
    // 400 が返ったら temperature を外して即やり直す（この互換リトライは試行回数に数えない）
    let includeTemperature = true;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetchFn('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            ...(includeTemperature ? { temperature } : {}),
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          if (res.status === 400 && includeTemperature) {
            includeTemperature = false;
            attempt--;
            throw new Error('OpenAI HTTP 400 (retrying without temperature)');
          }
          throw new Error(`OpenAI HTTP ${res.status}`);
        }
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

  /** 生成・推理系の呼び出し（generationModel + 高温） */
  private generateJson(system: string, user: string): Promise<unknown> {
    return this.callJson(
      system,
      user,
      GENERATION_TEMPERATURE,
      this.opts.generationModel ?? this.opts.model,
    );
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

  /** 直近に出したテーマの記憶（プロセス内）。「似たり寄ったり」を seed 的に排除するため、
   * 次回以降の生成プロンプトへ禁止語として渡し、それでも被ったら 1 回だけ作り直す */
  private recentThemes: string[] = [];
  private static readonly RECENT_THEMES_MAX = 30;

  async generateThemes(count: number): Promise<string[]> {
    const themes = await this.generateThemesOnce(count);
    const fresh = themes.some((t) => this.recentThemes.includes(t))
      ? await this.generateThemesOnce(count)
      : themes;
    this.recentThemes = [...this.recentThemes, ...fresh].slice(-OpenAIScorer.RECENT_THEMES_MAX);
    return fresh;
  }

  private async generateThemesOnce(count: number): Promise<string[]> {
    const genres = sampleGenres(count);
    const user = `要件:
- 日本語テーマを ${count} 個。誰でも知っている短い名詞（1〜6文字程度）。
- 各テーマはそれぞれ次のジャンルから 1 つずつ発想する: ${JSON.stringify(genres)}
- 互いに離れすぎず近すぎない中距離感。ジャンル名そのものは使わない。
- 最近出したテーマ（避けること。同じ語も似た語も不可): ${JSON.stringify(this.recentThemes)}
出力: {"themes":["テーマ1", ...]}`;
    const json = (await this.generateJson(THEME_SYSTEM, user)) as {
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
    const json = (await this.generateJson(CONCEPT_SYSTEM, user)) as {
      concepts?: unknown;
    };
    const arr = Array.isArray(json.concepts) ? json.concepts : [];
    return arr.filter((x): x is string => typeof x === 'string');
  }

  async generateHypotheses(
    themes: string[],
    hints: { attack: string; score: number }[],
    n: number,
    avoid: string[],
  ): Promise<string[]> {
    const user = `テーマ: ${JSON.stringify(themes)}
手掛かり（過去の攻撃語と、狙う秘ライフとの関連度）: ${JSON.stringify(hints)}
禁止語（使用不可）: ${JSON.stringify(avoid)}
要件: 上記の厳守事項に従い、相手が置いていそうな概念の推測を ${n} 個、重複なしで。
出力: {"guesses":["概念1", ...]}`;
    const json = (await this.generateJson(HYPO_SYSTEM, user)) as {
      guesses?: unknown;
    };
    const arr = Array.isArray(json.guesses) ? json.guesses : [];
    return arr.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  }

  async generateAttack(
    themes: string[],
    targetConcepts: string[],
    avoid: string[],
    intel?: {
      ownLives: string[];
      clues: { owner: string; life: string; hints: { attack: string; score: number }[] }[];
    },
  ): Promise<string> {
    const user = `テーマ: ${JSON.stringify(themes)}
対象概念（公開分。テーマと同じなら非公開しかいない）: ${JSON.stringify(targetConcepts)}
自分のライフ（これらと関連の高い語は絶対に出さない）: ${JSON.stringify(intel?.ownLives ?? [])}
手掛かり（相手の秘ライフ × 過去攻撃の関連度）: ${JSON.stringify(intel?.clues ?? [])}
禁止語（使用不可）: ${JSON.stringify(avoid)}
要件: 上記の厳守事項に従い、相手のライフに当たりそうな攻撃概念を 1 つ（20字以内）。
出力: {"attack":"概念"}`;
    const json = (await this.generateJson(ATTACK_SYSTEM, user)) as {
      attack?: unknown;
    };
    if (typeof json.attack !== 'string' || !json.attack.trim()) throw new Error('invalid attack');
    return json.attack.trim();
  }
}
