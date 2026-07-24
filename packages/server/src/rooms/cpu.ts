import type { ScoredCandidate } from '@concept-curling/shared';

/**
 * CPU のライフ選抜（決定的 + allSecret=false のときのみ SECRET をランダム）:
 * pickable 候補を合計の低い（=合格圏で最もテーマから遠く、相手に推測されにくい）順に maxLives 個。
 * 攻撃はテーマ連想で飛んでくるため、関連が深い概念ほど当てられやすい。
 * allSecret なら選抜した全部が SECRET、そうでなければ選抜内からランダムに 1 個。
 * pickable 0 件は null（その席はエンジンが applyScores 時点で即敗北させている）。
 */
export function decidePick(
  candidates: ScoredCandidate[],
  maxLives: number,
  allSecret: boolean,
): { selectedIndices: number[]; secretIndexes: number[] } | null {
  const chosen = candidates
    .map((c, i) => ({ c, i }))
    .filter((x) => x.c.pickable)
    .sort((p, q) => p.c.total - q.c.total)
    .slice(0, maxLives);
  if (chosen.length === 0) return null;
  const selectedIndices = chosen.map((x) => x.i).sort((a, b) => a - b);
  const secretIndexes = allSecret
    ? [...selectedIndices]
    : [
        selectedIndices[Math.floor(Math.random() * selectedIndices.length)] ??
          (selectedIndices[0] as number),
      ];
  return { selectedIndices, secretIndexes };
}
