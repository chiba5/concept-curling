import type { GameState, Result } from './types.js';
import { aliveSeats, err, ok } from './types.js';
import { getSeat } from './state.js';

export function submitAttack(
  state: GameState,
  seat: number,
  concept: string,
): Result<{ state: GameState; readyToResolve: boolean }> {
  if (state.phase !== 'battle') return err('bad_phase', '攻撃は battle 中のみ');
  const target = getSeat(state, seat);
  if (!target) return err('no_seat', `席 ${seat} は存在しません`);
  if (!target.alive) return err('not_alive', '脱落済みです');
  if (target.attack !== null) return err('already_attacked', 'このターンは提出済みです');
  const next = structuredClone(state);
  const t = next.seats.find((s) => s.seat === seat);
  if (t) t.attack = concept;
  const readyToResolve = aliveSeats(next).every((s) => s.attack !== null);
  return ok({ state: next, readyToResolve });
}

export interface AttackPair {
  a: string; // 攻撃概念
  b: string; // 対象ライフ概念
  atkSeat: number;
  targetSeat: number;
  targetKind: 'normal' | 'secret';
  targetConcept: string;
}

/** 攻撃 × 全生存者の全ライフ（自席を含む）の正準順序ペア列 */
export function attackPairs(state: GameState): AttackPair[] {
  const pairs: AttackPair[] = [];
  const attackers = aliveSeats(state).filter((s) => s.attack !== null);
  for (const atk of attackers) {
    for (const owner of aliveSeats(state)) {
      if (!owner.lives) continue;
      for (const concept of owner.lives.normals) {
        pairs.push({
          a: atk.attack ?? '',
          b: concept,
          atkSeat: atk.seat,
          targetSeat: owner.seat,
          targetKind: 'normal',
          targetConcept: concept,
        });
      }
      const secret = owner.lives.secret;
      if (secret && !secret.destroyed) {
        pairs.push({
          a: atk.attack ?? '',
          b: secret.concept,
          atkSeat: atk.seat,
          targetSeat: owner.seat,
          targetKind: 'secret',
          targetConcept: secret.concept,
        });
      }
    }
  }
  return pairs;
}
