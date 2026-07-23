import type { ScoredCandidate } from '@concept-curling/shared';
import type { GameState, Result } from './types.js';
import { aliveSeats, err, ok } from './types.js';
import { getSeat } from './state.js';

export function submitConcepts(state: GameState, seat: number, concepts: string[]): Result {
  if (state.phase !== 'submitting') return err('bad_phase', '概念提出は submitting 中のみ');
  const target = getSeat(state, seat);
  if (!target) return err('no_seat', `席 ${seat} は存在しません`);
  if (!target.alive) return err('not_alive', '脱落済みです');
  if (target.submittedConcepts) return err('already_submitted', '提出済みです');
  if (concepts.length !== state.config.conceptsPerPlayer)
    return err('concept_count', `概念は ${state.config.conceptsPerPlayer} 個ちょうど必要です`);
  if (new Set(concepts).size !== concepts.length)
    return err('duplicate_concepts', '同じ概念を複数提出することはできません');
  const next = structuredClone(state);
  const t = next.seats.find((s) => s.seat === seat);
  if (t) t.submittedConcepts = [...concepts];
  return ok(next);
}

export interface ScoreRow {
  scores: number[];
  reasons: string[];
}

export function applyScores(state: GameState, seat: number, table: ScoreRow[]): Result {
  if (state.phase !== 'submitting') return err('bad_phase', '採点適用は submitting 中のみ');
  const target = getSeat(state, seat);
  if (!target) return err('no_seat', `席 ${seat} は存在しません`);
  if (!target.submittedConcepts) return err('not_submitted', '概念が未提出です');
  if (target.candidates) return err('already_scored', '採点済みです');
  const themeCount = state.config.themes.count;
  if (
    table.length !== target.submittedConcepts.length ||
    table.some(
      (row) =>
        row.scores.length !== themeCount ||
        row.reasons.length !== themeCount ||
        row.scores.some((v) => !Number.isFinite(v)),
    )
  )
    return err('score_shape', '採点表の形が提出内容と一致しません');

  const next = structuredClone(state);
  const t = next.seats.find((s) => s.seat === seat);
  if (!t || !t.submittedConcepts) return err('no_seat', '内部不整合');

  const candidates: ScoredCandidate[] = t.submittedConcepts.map((concept, i) => {
    const row = table[i];
    const scores = row ? [...row.scores] : [];
    const total = scores.reduce((a, b) => a + b, 0);
    return {
      concept,
      scores,
      reasons: row ? [...row.reasons] : [],
      total,
      pickable: total <= next.config.pickSumLimit,
    };
  });
  t.candidates = candidates;

  // 即敗北: pickable が 1 つも無い（spec §3-4）
  if (!candidates.some((c) => c.pickable)) t.alive = false;

  // 全席採点済みなら遷移
  if (next.seats.every((s) => s.candidates !== null)) {
    const alive = aliveSeats(next);
    if (alive.length <= 1) {
      next.phase = 'finished';
      next.winnerSeat = alive[0]?.seat ?? null;
    } else {
      next.phase = 'picking';
    }
  }
  return ok(next);
}
