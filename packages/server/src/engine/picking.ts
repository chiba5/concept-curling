import type { GameState, Result } from './types.js';
import { aliveSeats, err, ok } from './types.js';
import { getSeat } from './state.js';

export function pickLives(
  state: GameState,
  seat: number,
  selectedIndices: number[],
  secretIndex: number,
): Result {
  if (state.phase !== 'picking') return err('bad_phase', 'ライフ選抜は picking 中のみ');
  const target = getSeat(state, seat);
  if (!target) return err('no_seat', `席 ${seat} は存在しません`);
  if (!target.alive) return err('not_alive', '脱落済みです');
  if (target.lives) return err('already_picked', '選抜済みです');
  const candidates = target.candidates;
  if (!candidates) return err('not_scored', '採点が未完了です');

  if (selectedIndices.length < 1 || selectedIndices.length > state.config.maxLives)
    return err('too_many', `選べるのは 1〜${state.config.maxLives} 個です`);
  if (new Set(selectedIndices).size !== selectedIndices.length)
    return err('duplicate_indices', 'インデックスが重複しています');
  if (selectedIndices.some((i) => !Number.isInteger(i) || i < 0 || i >= candidates.length))
    return err('out_of_range', 'インデックスが範囲外です');
  if (!selectedIndices.includes(secretIndex))
    return err('secret_not_selected', 'SECRET は選抜した中から指定してください');
  if (selectedIndices.some((i) => !candidates[i]?.pickable))
    return err('not_pickable', `合計 ${state.config.pickSumLimit} 以下の候補のみ選べます`);

  const next = structuredClone(state);
  const t = next.seats.find((s) => s.seat === seat);
  const cands = t?.candidates;
  if (!t || !cands) return err('no_seat', '内部不整合');

  const secretConcept = cands[secretIndex]?.concept ?? '';
  t.lives = {
    normals: selectedIndices.filter((i) => i !== secretIndex).map((i) => cands[i]?.concept ?? ''),
    secret: { concept: secretConcept, destroyed: false, revealed: false },
  };

  if (aliveSeats(next).every((s) => s.lives !== null)) {
    next.phase = 'battle';
    next.round = 1;
  }
  return ok(next);
}
