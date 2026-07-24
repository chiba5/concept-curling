import type { ScoredCandidate } from '@concept-curling/shared';
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
  owner: string;
  life: string;
  hints: { attack: string; score: number }[];
}

export interface AttackIntel {
  /** 自分の残ライフ概念（これらと関連の高い攻撃は自滅する） */
  ownLives: string[];
  clues: SecretClue[];
}

/**
 * CPU の攻撃決定: 生成 → 自分の残ライフとの関連度を実採点で自己検査 → 破壊圏なら 1 回だけ作り直す。
 * 2 案とも危険なら自滅リスク（自ライフとの最大関連度）が低い方を使う。
 * プロンプト頼みにせず、自滅回避を機械的に保証するのが狙い。
 */
export async function decideAttack(
  scorer: Scorer,
  themes: string[],
  targets: string[],
  avoid: string[],
  intel: AttackIntel,
  destroyThreshold: number,
): Promise<string> {
  const selfRisk = async (attack: string): Promise<number> => {
    if (!intel.ownLives.length) return 0;
    const scores = await scorer.scorePairs(intel.ownLives.map((b) => ({ a: attack, b })));
    return Math.max(...scores.map((s) => s.score));
  };
  const first = await scorer.generateAttack(themes, targets, avoid, intel);
  const riskFirst = await selfRisk(first);
  if (riskFirst < destroyThreshold) return first;
  const second = await scorer.generateAttack(themes, targets, [...avoid, first], intel);
  const riskSecond = await selfRisk(second);
  return riskSecond <= riskFirst ? second : first;
}
