import type { TurnDetail, TurnRecord } from '@concept-curling/shared';
import type { GameState, Result } from './types.js';
import { aliveSeats, err, lifeCount, ok } from './types.js';
import { attackPairs } from './battle.js';

export interface PairResult {
  score: number;
  reason: string;
}

// 同一ターゲットに複数の破壊ヒットがある場合、正準順序で先の攻撃者に破壊がクレジットされる（後続はスキップ）
export function resolveTurn(state: GameState, results: PairResult[]): Result {
  if (state.phase !== 'battle') return err('bad_phase', 'ターン解決は battle 中のみ');
  if (!aliveSeats(state).every((s) => s.attack !== null))
    return err('not_ready', '全員の攻撃が揃っていません');
  const pairs = attackPairs(state);
  if (results.length !== pairs.length || results.some((r) => !Number.isFinite(r.score)))
    return err('result_shape', `結果は ${pairs.length} 件の有限スコアが必要です`);

  const next = structuredClone(state);
  const { destroyThreshold } = next.config;

  const attacks = aliveSeats(next).map((s) => ({ seat: s.seat, concept: s.attack ?? '' }));
  const details: TurnDetail[] = [];
  const destroys: TurnRecord['destroys'] = [];
  const reveals: TurnRecord['reveals'] = [];

  pairs.forEach((pair, i) => {
    const res = results[i];
    const score = res?.score ?? 0;
    const reason = res?.reason ?? '';
    const owner = next.seats.find((s) => s.seat === pair.targetSeat);
    const lives = owner?.lives;
    // 概念文字列での照合は「同一プレイヤー内で概念は重複しない」（submitConcepts が拒否）ことに依存する
    const secret =
      pair.targetKind === 'secret'
        ? lives?.secrets.find((sec) => sec.concept === pair.targetConcept)
        : undefined;

    // ラベルは「この行の処理前」の公開状態で決める（未公開 SECRET は伏せる）
    const label =
      pair.targetKind === 'secret' && secret && !secret.revealed ? 'SECRET' : pair.targetConcept;

    let destroyed = false;
    if (score > destroyThreshold && owner && lives) {
      if (pair.targetKind === 'normal') {
        const idx = lives.open.indexOf(pair.targetConcept);
        if (idx !== -1) {
          lives.open.splice(idx, 1);
          destroyed = true;
          destroys.push({ seat: pair.targetSeat, kind: 'normal', concept: pair.targetConcept });
        }
      } else if (secret && !secret.destroyed) {
        secret.destroyed = true;
        secret.revealed = true;
        destroyed = true;
        destroys.push({ seat: pair.targetSeat, kind: 'secret', concept: pair.targetConcept });
        reveals.push({ seat: pair.targetSeat, concept: pair.targetConcept });
      }
    }

    details.push({
      atkSeat: pair.atkSeat,
      atkConcept: pair.a,
      targetSeat: pair.targetSeat,
      targetKind: pair.targetKind,
      targetOrdinal: pair.targetOrdinal,
      targetLabel: label,
      score,
      reason,
      destroyed,
    });
  });

  // 脱落処理と攻撃クリア
  const eliminatedSeats: number[] = [];
  for (const s of next.seats) {
    if (s.alive && lifeCount(s) === 0) {
      s.alive = false;
      eliminatedSeats.push(s.seat);
    }
    s.attack = null;
  }

  next.turns.push({ round: next.round, attacks, details, destroys, reveals, eliminatedSeats });

  const alive = aliveSeats(next);
  if (alive.length <= 1) {
    next.phase = 'finished';
    next.winnerSeat = alive[0]?.seat ?? null;
  } else {
    next.round += 1;
  }
  return ok(next);
}
