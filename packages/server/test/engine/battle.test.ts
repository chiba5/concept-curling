import { describe, expect, it } from 'vitest';
import { attackPairs, submitAttack } from '../../src/engine/battle.js';
import { cfg, inBattle, unwrap } from './helpers.js';

describe('submitAttack', () => {
  it('攻撃を登録し、全員揃うと readyToResolve=true', () => {
    let r = unwrap(submitAttack(inBattle(), 1, '嵐'));
    expect(r.readyToResolve).toBe(false);
    r = unwrap(submitAttack(r.state, 2, '灯台守'));
    r = unwrap(submitAttack(r.state, 3, '神話'));
    expect(r.readyToResolve).toBe(true);
    expect(r.state.seats.map((s) => s.attack)).toEqual(['嵐', '灯台守', '神話']);
  });
  it('二重提出は already_attacked', () => {
    const r1 = unwrap(submitAttack(inBattle(), 1, '嵐'));
    const r2 = submitAttack(r1.state, 1, '雷');
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe('already_attacked');
  });
  it('battle 以外は bad_phase / 脱落席は not_alive', () => {
    expect(submitAttack({ ...inBattle(), phase: 'picking' }, 1, '嵐').ok).toBe(false);
    const s = structuredClone(inBattle());
    const seat2 = s.seats[1];
    if (seat2) seat2.alive = false;
    const r = submitAttack(s, 2, '嵐');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_alive');
  });
});

describe('attackPairs', () => {
  it('正準順序: 攻撃者昇順 → 対象所有者昇順 → normals 配列順 → SECRET', () => {
    let s = inBattle(cfg({ playerCount: 2 }));
    s = unwrap(submitAttack(s, 1, '嵐')).state;
    s = unwrap(submitAttack(s, 2, '雷')).state;
    const pairs = attackPairs(s);
    // 各席のライフ: normals [概念X-1, 概念X-2] + SECRET 概念X-0 → 3 ライフ × 2 所有者 × 2 攻撃者 = 12 ペア
    expect(pairs).toHaveLength(12);
    expect(pairs[0]).toEqual({
      a: '嵐',
      b: '概念1-1',
      atkSeat: 1,
      targetSeat: 1,
      targetKind: 'normal',
      targetConcept: '概念1-1',
    });
    expect(pairs[2]).toEqual({
      a: '嵐',
      b: '概念1-0',
      atkSeat: 1,
      targetSeat: 1,
      targetKind: 'secret',
      targetConcept: '概念1-0',
    });
    expect(pairs[6]?.atkSeat).toBe(2);
  });
  it('破壊済み SECRET と脱落席はペアに含めない', () => {
    let s = inBattle(cfg({ playerCount: 2 }));
    s = unwrap(submitAttack(s, 1, '嵐')).state;
    s = unwrap(submitAttack(s, 2, '雷')).state;
    const mut = structuredClone(s);
    const secret1 = mut.seats[0]?.lives?.secret;
    if (secret1) secret1.destroyed = true;
    const pairs = attackPairs(mut);
    expect(pairs.filter((p) => p.targetSeat === 1)).toHaveLength(4); // normals 2 × 攻撃者 2
  });
});
