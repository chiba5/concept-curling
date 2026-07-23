import type { ScoredCandidate } from '@concept-curling/shared';

/**
 * CPU のライフ選抜（決定的 + SECRET のみランダム）:
 * pickable 候補を合計の低い（安全な）順に maxLives 個。SECRET は選抜内からランダム。
 * pickable 0 件は null（その席はエンジンが applyScores 時点で即敗北させている）。
 */
export function decidePick(
  candidates: ScoredCandidate[],
  maxLives: number,
): { selectedIndices: number[]; secretIndex: number } | null {
  const chosen = candidates
    .map((c, i) => ({ c, i }))
    .filter((x) => x.c.pickable)
    .sort((p, q) => p.c.total - q.c.total)
    .slice(0, maxLives);
  if (chosen.length === 0) return null;
  const selectedIndices = chosen.map((x) => x.i).sort((a, b) => a - b);
  const secretIndex =
    selectedIndices[Math.floor(Math.random() * selectedIndices.length)] ??
    (selectedIndices[0] as number);
  return { selectedIndices, secretIndex };
}
