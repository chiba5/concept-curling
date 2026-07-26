import type { ScoredCandidate } from '@concept-curling/shared';
import { MAX_CONCEPT_LENGTH } from '@concept-curling/shared';
import { CONCEPT_POOL } from '../scoring/demo.js';
import type { Scorer } from '../scoring/scorer.js';

/**
 * CPU のライフ選抜:
 * pickable 候補から「合格圏で最もテーマから遠く（推測されにくい）、かつ互いに離れた」組を選ぶ。
 * pairScore（候補同士の関連度行列）があれば貪欲法で分散を最大化する — 1 つの攻撃で
 * 複数ライフが同時に壊されないようにするため。無ければ従来どおり合計の低い順。
 * allSecret なら選抜した全部が SECRET、そうでなければ選抜内からランダムに 1 個。
 * pickable 0 件は null（その席はエンジンが applyScores 時点で即敗北させている）。
 */
export function decidePick(
  candidates: ScoredCandidate[],
  maxLives: number,
  allSecret: boolean,
  pairScore?: number[][],
): { selectedIndices: number[]; secretIndexes: number[] } | null {
  const pickable = candidates.map((c, i) => ({ c, i })).filter((x) => x.c.pickable);
  if (pickable.length === 0) return null;
  const byTotal = [...pickable].sort((p, q) => p.c.total - q.c.total);
  let chosenIdx: number[];
  if (!pairScore) {
    chosenIdx = byTotal.slice(0, maxLives).map((x) => x.i);
  } else {
    // 貪欲選択: 最も遠い候補から始め、以降は「選択済みとの最大関連度」が最小の候補を足す。
    // 同率なら合計の低い（テーマから遠い）方を優先
    const first = byTotal[0] as { c: ScoredCandidate; i: number };
    const chosen = [first];
    const rest = byTotal.slice(1);
    while (chosen.length < maxLives && rest.length) {
      let bestK = 0;
      let bestKey = Infinity;
      rest.forEach((cand, k) => {
        const maxRel = Math.max(...chosen.map((ch) => pairScore[cand.i]?.[ch.i] ?? 0));
        const key = maxRel * 1000 + cand.c.total;
        if (key < bestKey) {
          bestKey = key;
          bestK = k;
        }
      });
      chosen.push(...rest.splice(bestK, 1));
    }
    chosenIdx = chosen.map((x) => x.i);
  }
  const selectedIndices = chosenIdx.sort((a, b) => a - b);
  const secretIndexes = allSecret
    ? [...selectedIndices]
    : [
        selectedIndices[Math.floor(Math.random() * selectedIndices.length)] ??
          (selectedIndices[0] as number),
      ];
  return { selectedIndices, secretIndexes };
}

/** ライフ候補が「1 ホップ語」（どれかのテーマと直接的すぎて即当てられる）と判定する閾値 */
const LIFE_HOT_THRESHOLD = 60;

/**
 * CPU のライフ候補生成 + 検品:
 * 生成した候補を各テーマと実採点し、不良候補を 1 回だけ作り直して置き換える。
 * 不良 = どれかのテーマと LIFE_HOT_THRESHOLD 以上の「1 ホップ語」（即当てられる。テーマ
 * 「メロディー」に リズム・楽器・楽譜 が出て 1 攻撃 2 枚破壊を本番で確認）、または合計が
 * pickMinTotal 未満の「遠すぎ語」（選抜不能。全滅すると CPU が picking で即敗北する事象を
 * 本番で確認 — プロンプトの目標帯だけでは生成 LLM が守らない）。
 * 実採点は LRU キャッシュされるため、ここでの判定は本選抜（applyScores）と同じ値になる。
 * それでも n 個に足りなければ「選抜可能 → テーマに近すぎない順」で埋めて必ず n 個返す
 * （n 個未満はエンジンが提出を拒否してゲームが submitting で止まるため）。
 */
export async function generateInspectedConcepts(
  scorer: Scorer,
  themes: string[],
  n: number,
  avoid: string[],
  pickMinTotal: number,
): Promise<string[]> {
  const heat = new Map<string, { max: number; total: number }>();
  const measure = async (words: string[]): Promise<void> => {
    const fresh = words.filter((w) => !heat.has(w));
    if (!themes.length || !fresh.length) {
      fresh.forEach((w) => heat.set(w, { max: 0, total: 0 }));
      return;
    }
    const scores = await scorer.scorePairs(
      fresh.flatMap((w) => themes.map((t) => ({ a: w, b: t }))),
    );
    fresh.forEach((w, wi) => {
      const slice = scores.slice(wi * themes.length, (wi + 1) * themes.length);
      heat.set(w, {
        max: Math.max(...slice.map((s) => s.score)),
        total: slice.reduce((acc, s) => acc + s.score, 0),
      });
    });
  };
  const good = (w: string): boolean => {
    const h = heat.get(w);
    return !!h && h.max < LIFE_HOT_THRESHOLD && h.total >= pickMinTotal;
  };

  const first = await scorer.generateConcepts(themes, n, avoid);
  await measure(first);
  let ok = first.filter(good);
  if (ok.length >= n) return ok.slice(0, n);

  const second = (
    await scorer.generateConcepts(themes, n, [...new Set([...avoid, ...first])])
  ).filter((w) => !first.includes(w));
  await measure(second);
  ok = [...ok, ...second.filter(good)];
  if (ok.length >= n) return ok.slice(0, n);

  // 埋め順: 選抜可能（total >= pickMinTotal）を優先し、その中ではテーマに近すぎない順
  const leftovers = [...first, ...second]
    .filter((w) => !ok.includes(w))
    .sort((a, b) => {
      const ha = heat.get(a) ?? { max: 100, total: 0 };
      const hb = heat.get(b) ?? { max: 100, total: 0 };
      const pa = ha.total >= pickMinTotal ? 0 : 1;
      const pb = hb.total >= pickMinTotal ? 0 : 1;
      return pa - pb || ha.max - hb.max;
    });
  return [...ok, ...leftovers].slice(0, n);
}

/** 相手の秘ライフ 1 枚ぶんの手掛かり: 過去の攻撃語との関連度（判定録から逆算できる情報のみ） */
export interface SecretClue {
  seat: number;
  owner: string;
  life: string;
  hints: { attack: string; score: number }[];
}

export interface OpponentInfo {
  seat: number;
  name: string;
  livesRemaining: number;
  openLives: string[];
}

export interface AttackContext {
  themes: string[];
  /** 自分の残ライフ概念（これらと関連の高い攻撃は自滅する） */
  ownLives: string[];
  opponents: OpponentInfo[];
  clues: SecretClue[];
  avoid: string[];
  destroyThreshold: number;
}

/** 判定録との整合検証に使う直近の手掛かり数（コストと情報量のバランス） */
const VALIDATE_RECENT = 6;
/** 相手ライフの推測候補数 */
const HYPOTHESES = 6;
/** フォールバック生成の最大試行回数 */
const FALLBACK_TRIES = 3;
/** テーマとこれ以上の関連度の攻撃は「テーマの言い換え」として禁止する閾値。
 * エンジンはテーマの完全一致しか弾けず、本番でテーマ「バイク」への攻撃「オートバイ」が
 * 2 枚同時破壊する開幕が成立した — 全員のライフがテーマ関連を強制される（pickMinTotal）以上、
 * テーマ言い換え攻撃は単調な必勝手になるため CPU には使わせない */
const THEME_NEAR_LIMIT = 85;

/**
 * CPU の攻撃決定（仮説駆動）:
 * 1. 主標的 = 残りライフ最多の相手（最大の脅威を削る）
 * 2. 標的の秘ライフのうち手掛かりが最も「惜しい」ものに対し、相手概念の仮説を LLM に推測させる
 *    （低スコア履歴 = 領域の除外、を明示指示）
 * 3. 各仮説を過去の攻撃語と実採点し、判定録の観測値との誤差が小さい順に並べ替える（三角測量）
 * 4. 自分の残ライフに破壊圏で当たらない安全な仮説のうち最有力を攻撃に使う
 * 5. 仮説が全滅なら従来生成を最大 3 回 → それでも安全が無ければ中立プールから最小リスク語。
 *    破壊圏の自滅攻撃は決して投げない
 */
export async function decideAttack(scorer: Scorer, ctx: AttackContext): Promise<string> {
  const avoidSet = new Set([...ctx.avoid, ...ctx.ownLives].map((a) => a.trim()));
  const normalize = (w: string): string => w.trim().slice(0, MAX_CONCEPT_LENGTH);

  /** 各語のリスク（self=自ライフとの最大関連度 / theme=テーマとの最大関連度）を 1 バッチで採点する */
  const risks = async (words: string[]): Promise<Map<string, { self: number; theme: number }>> => {
    const m = new Map<string, { self: number; theme: number }>();
    const bases = [...ctx.ownLives, ...ctx.themes];
    if (!bases.length || !words.length) {
      words.forEach((w) => m.set(w, { self: 0, theme: 0 }));
      return m;
    }
    const scores = await scorer.scorePairs(words.flatMap((w) => bases.map((b) => ({ a: w, b }))));
    words.forEach((w, wi) => {
      const slice = scores.slice(wi * bases.length, (wi + 1) * bases.length);
      const selfSlice = slice.slice(0, ctx.ownLives.length);
      const themeSlice = slice.slice(ctx.ownLives.length);
      m.set(w, {
        self: Math.max(0, ...selfSlice.map((s) => s.score)),
        theme: Math.max(0, ...themeSlice.map((s) => s.score)),
      });
    });
    return m;
  };
  /** 安全 = 自滅圏でなく、テーマの言い換えでもない */
  const isSafe = (r: { self: number; theme: number } | undefined): boolean =>
    !!r && r.self < ctx.destroyThreshold && r.theme < THEME_NEAR_LIMIT;

  // 1) 主標的と、その秘ライフのうち最も手掛かりが「惜しい」もの
  const target = [...ctx.opponents].sort(
    (p, q) => q.livesRemaining - p.livesRemaining || p.seat - q.seat,
  )[0];
  const targetClues = target ? ctx.clues.filter((c) => c.seat === target.seat) : [];
  const focus = [...targetClues].sort(
    (p, q) =>
      Math.max(0, ...q.hints.map((h) => h.score)) - Math.max(0, ...p.hints.map((h) => h.score)),
  )[0];

  // 2) 仮説生成
  const hypos = (
    await scorer.generateHypotheses(ctx.themes, focus?.hints ?? [], HYPOTHESES, [...avoidSet])
  )
    .map(normalize)
    .filter((h) => h && !avoidSet.has(h));
  let ranked = [...new Set(hypos)];

  // 3) 判定録との整合検証: 仮説×過去攻撃を実採点し、観測スコアとの平均絶対誤差が小さい順
  const recent = (focus?.hints ?? []).slice(-VALIDATE_RECENT);
  if (ranked.length && recent.length) {
    const scores = await scorer.scorePairs(
      ranked.flatMap((h) => recent.map((r) => ({ a: h, b: r.attack }))),
    );
    const err = new Map<string, number>();
    ranked.forEach((h, hi) => {
      const slice = scores.slice(hi * recent.length, (hi + 1) * recent.length);
      const e =
        slice.reduce((acc, s, k) => acc + Math.abs(s.score - (recent[k]?.score ?? 0)), 0) /
        recent.length;
      err.set(h, e);
    });
    ranked = [...ranked].sort((p, q) => (err.get(p) ?? 0) - (err.get(q) ?? 0));
  }

  // 4) 安全な仮説のうち最有力
  if (ranked.length) {
    const r = await risks(ranked);
    const safe = ranked.find((h) => isSafe(r.get(h)));
    if (safe) return safe;
  }

  // 5) フォールバック: 従来生成 → 中立プール。破壊圏・テーマ言い換えの語は決して返さない
  const legacyIntel = { ownLives: ctx.ownLives, clues: ctx.clues };
  const legacyTargets = target?.openLives.length ? target.openLives : ctx.themes;
  const tried: string[] = [];
  for (let i = 0; i < FALLBACK_TRIES; i++) {
    const a = normalize(
      await scorer.generateAttack(ctx.themes, legacyTargets, [...avoidSet, ...tried], legacyIntel),
    );
    if (!a || avoidSet.has(a) || tried.includes(a)) continue;
    const r = await risks([a]);
    if (isSafe(r.get(a))) return a;
    tried.push(a);
  }
  const neutral = CONCEPT_POOL.filter((c) => !avoidSet.has(c) && !tried.includes(c));
  const pool = neutral.length ? neutral : tried.length ? tried : ['静物画'];
  const poolRisks = await risks(pool);
  return (
    [...pool].sort(
      (p, q) => (poolRisks.get(p)?.self ?? 100) - (poolRisks.get(q)?.self ?? 100),
    )[0] ?? '静物画'
  );
}
