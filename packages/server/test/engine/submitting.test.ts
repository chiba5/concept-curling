import { describe, expect, it } from 'vitest';
import { applyScores, submitConcepts } from '../../src/engine/submitting.js';
import { cfg, inSubmitting, unwrap } from './helpers.js';

const FIVE = ['灯台', '羊皮紙', '炊飯器', '季節風', '簿記'];
const table5 = (score: number) =>
  FIVE.map(() => ({ scores: [score, score], reasons: ['理由A', '理由B'] }));

describe('submitConcepts', () => {
  it('conceptsPerPlayer 個ちょうどを受理し提出済みになる', () => {
    const s = unwrap(submitConcepts(inSubmitting(), 1, FIVE));
    expect(s.seats[0]?.submittedConcepts).toEqual(FIVE);
  });
  it('個数不足は concept_count', () => {
    const r = submitConcepts(inSubmitting(), 1, FIVE.slice(0, 4));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('concept_count');
  });
  it('重複概念は duplicate_concepts', () => {
    const r = submitConcepts(inSubmitting(), 1, ['灯台', '灯台', '炊飯器', '季節風', '簿記']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('duplicate_concepts');
  });
  it('二重提出は already_submitted', () => {
    const s = unwrap(submitConcepts(inSubmitting(), 1, FIVE));
    const r = submitConcepts(s, 1, FIVE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('already_submitted');
  });
  it('脱落済みの席からの提出は not_alive', () => {
    const s = structuredClone(inSubmitting());
    const seat1 = s.seats[0];
    if (seat1) seat1.alive = false;
    const r = submitConcepts(s, 1, FIVE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_alive');
  });
  it('submitting 以外では bad_phase / 不在席は no_seat', () => {
    const rp = submitConcepts({ ...inSubmitting(), phase: 'battle' }, 1, FIVE);
    expect(rp.ok).toBe(false);
    if (!rp.ok) expect(rp.error.code).toBe('bad_phase');
    const r = submitConcepts(inSubmitting(), 99, FIVE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('no_seat');
  });
});

describe('applyScores', () => {
  it('candidates を構築し total / pickable を計算する', () => {
    let s = unwrap(submitConcepts(inSubmitting(), 1, FIVE));
    s = unwrap(applyScores(s, 1, table5(60)));
    const c = s.seats[0]?.candidates;
    expect(c).toHaveLength(5);
    expect(c?.[0]).toEqual({
      concept: '灯台',
      scores: [60, 60],
      reasons: ['理由A', '理由B'],
      total: 120,
      pickable: true, // 120 <= 150
    });
  });
  it('total が pickSumLimit 超なら pickable=false', () => {
    let s = unwrap(submitConcepts(inSubmitting(), 1, FIVE));
    s = unwrap(applyScores(s, 1, table5(80))); // total 160 > 150
    expect(s.seats[0]?.candidates?.every((c) => !c.pickable)).toBe(true);
  });
  it('pickable が 0 件の席は即敗北（alive=false）', () => {
    let s = unwrap(submitConcepts(inSubmitting(), 1, FIVE));
    s = unwrap(applyScores(s, 1, table5(80)));
    expect(s.seats[0]?.alive).toBe(false);
  });
  it('全席の採点が済むと picking へ遷移する', () => {
    let s = inSubmitting();
    for (const seat of [1, 2, 3]) {
      s = unwrap(
        submitConcepts(
          s,
          seat,
          FIVE.map((c) => `${c}${seat}`),
        ),
      );
      s = unwrap(applyScores(s, seat, table5(60)));
    }
    expect(s.phase).toBe('picking');
  });
  it('即敗北の結果生存 1 名以下なら finished + 勝者確定', () => {
    let s = inSubmitting(cfg({ playerCount: 2 }));
    s = unwrap(submitConcepts(s, 1, FIVE));
    s = unwrap(applyScores(s, 1, table5(80))); // P1 即敗北
    s = unwrap(
      submitConcepts(
        s,
        2,
        FIVE.map((c) => `${c}2`),
      ),
    );
    s = unwrap(applyScores(s, 2, table5(60)));
    expect(s.phase).toBe('finished');
    expect(s.winnerSeat).toBe(2);
  });
  it('table の行数・列数不一致は score_shape', () => {
    const s = unwrap(submitConcepts(inSubmitting(), 1, FIVE));
    const r1 = applyScores(s, 1, table5(60).slice(0, 4));
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe('score_shape');
    const r2 = applyScores(
      s,
      1,
      FIVE.map(() => ({ scores: [60], reasons: ['x'] })),
    );
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe('score_shape');
  });
  it('未提出席への採点は not_submitted、二重採点は already_scored', () => {
    const r = applyScores(inSubmitting(), 1, table5(60));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_submitted');
    let s = unwrap(submitConcepts(inSubmitting(), 1, FIVE));
    s = unwrap(applyScores(s, 1, table5(60)));
    const r2 = applyScores(s, 1, table5(60));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe('already_scored');
  });
});
