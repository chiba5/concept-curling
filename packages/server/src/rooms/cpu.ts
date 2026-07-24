import type { ScoredCandidate } from '@concept-curling/shared';

/**
 * CPU のライフ選抜（決定的 + allSecret=false のときのみ SECRET をランダム）:
 * pickable 候補を合計の高い（テーマとの関連が深い）順に maxLives 個。
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
    .sort((p, q) => q.c.total - p.c.total)
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
