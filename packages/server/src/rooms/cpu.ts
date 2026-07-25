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

  /** 各語の自滅リスク（自ライフとの最大関連度）を 1 バッチで採点する */
  const selfRisks = async (words: string[]): Promise<Map<string, number>> => {
    const m = new Map<string, number>();
    if (!ctx.ownLives.length || !words.length) {
      words.forEach((w) => m.set(w, 0));
      return m;
    }
    const scores = await scorer.scorePairs(
      words.flatMap((w) => ctx.ownLives.map((b) => ({ a: w, b }))),
    );
    words.forEach((w, wi) => {
      const slice = scores.slice(wi * ctx.ownLives.length, (wi + 1) * ctx.ownLives.length);
      m.set(w, Math.max(...slice.map((s) => s.score)));
    });
    return m;
  };

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
    const risks = await selfRisks(ranked);
    const safe = ranked.find((h) => (risks.get(h) ?? 100) < ctx.destroyThreshold);
    if (safe) return safe;
  }

  // 5) フォールバック: 従来生成 → 中立プール。破壊圏の語は決して返さない
  const legacyIntel = { ownLives: ctx.ownLives, clues: ctx.clues };
  const legacyTargets = target?.openLives.length ? target.openLives : ctx.themes;
  const tried: string[] = [];
  for (let i = 0; i < FALLBACK_TRIES; i++) {
    const a = normalize(
      await scorer.generateAttack(ctx.themes, legacyTargets, [...avoidSet, ...tried], legacyIntel),
    );
    if (!a || avoidSet.has(a) || tried.includes(a)) continue;
    const r = await selfRisks([a]);
    if ((r.get(a) ?? 100) < ctx.destroyThreshold) return a;
    tried.push(a);
  }
  const neutral = CONCEPT_POOL.filter((c) => !avoidSet.has(c) && !tried.includes(c));
  const pool = neutral.length ? neutral : tried.length ? tried : ['静物画'];
  const risks = await selfRisks(pool);
  return [...pool].sort((p, q) => (risks.get(p) ?? 100) - (risks.get(q) ?? 100))[0] ?? '静物画';
}
