import type { GameState, Result } from './types.js';
import { aliveSeats, err, ok } from './types.js';
import { getSeat } from './state.js';

export function pickLives(
  state: GameState,
  seat: number,
  selectedIndices: number[],
  secretIndexes: number[],
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
    return err('duplicate_indices', 'selectedIndices が重複しています');
  if (selectedIndices.some((i) => !Number.isInteger(i) || i < 0 || i >= candidates.length))
    return err('out_of_range', 'インデックスが範囲外です');
  if (selectedIndices.some((i) => !candidates[i]?.pickable))
    return err('not_pickable', `関連度合計 ${state.config.pickMinTotal} 以上の候補のみ選べます`);

  if (secretIndexes.length < 1)
    return err('secret_not_selected', 'SECRET を 1 つ以上指定してください');
  if (new Set(secretIndexes).size !== secretIndexes.length)
    return err('duplicate_indices', 'secretIndexes が重複しています');
  if (!secretIndexes.every((i) => selectedIndices.includes(i)))
    return err('secret_not_selected', 'SECRET は選抜した中から指定してください');

  if (state.config.allSecret) {
    const selectedSet = new Set(selectedIndices);
    const secretSet = new Set(secretIndexes);
    if (selectedSet.size !== secretSet.size || [...selectedSet].some((i) => !secretSet.has(i)))
      return err('secret_mismatch', 'allSecret ルームでは選抜した全ライフが SECRET になります');
  } else if (secretIndexes.length !== 1) {
    return err('secret_count', 'SECRET はちょうど 1 個指定してください');
  }

  const next = structuredClone(state);
  const t = next.seats.find((s) => s.seat === seat);
  const cands = t?.candidates;
  if (!t || !cands) return err('no_seat', '内部不整合');

  const secretIndexSet = new Set(secretIndexes);
  t.lives = {
    open: selectedIndices.filter((i) => !secretIndexSet.has(i)).map((i) => cands[i]?.concept ?? ''),
    secrets: secretIndexes.map((i) => ({
      concept: cands[i]?.concept ?? '',
      destroyed: false,
      revealed: false,
    })),
  };

  if (aliveSeats(next).every((s) => s.lives !== null)) {
    next.phase = 'battle';
    next.round = 1;
  }
  return ok(next);
}
