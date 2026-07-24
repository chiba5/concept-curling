import { describe, expect, it } from 'vitest';
import { pickLives } from '../../src/engine/picking.js';
import { lifeCount } from '../../src/engine/types.js';
import { allScored, cfg, unwrap } from './helpers.js';

// allScored(): 3人・各5概念・全スコア40（total 80 >= 50、全候補 pickable）

describe('pickLives（allSecret: false、従来の 1-secret + open）', () => {
  it('選抜を確定し open / secrets に分ける', () => {
    const s = unwrap(pickLives(allScored(), 1, [0, 2, 4], [2]));
    const seat = s.seats[0];
    expect(seat?.lives?.open).toEqual(['概念1-0', '概念1-4']);
    expect(seat?.lives?.secrets).toEqual([
      { concept: '概念1-2', destroyed: false, revealed: false },
    ]);
    expect(seat ? lifeCount(seat) : 0).toBe(3);
  });
  it('1 個選択なら必然的にそれが SECRET', () => {
    const s = unwrap(pickLives(allScored(), 1, [3], [3]));
    expect(s.seats[0]?.lives?.open).toEqual([]);
    expect(s.seats[0]?.lives?.secrets[0]?.concept).toBe('概念1-3');
  });
  it('maxLives 超の選択は too_many', () => {
    const r = pickLives(allScored(cfg({ maxLives: 2 })), 1, [0, 1, 2], [0]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('too_many');
  });
  it('範囲外インデックスは out_of_range', () => {
    const r = pickLives(allScored(), 1, [0, 9], [0]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('out_of_range');
  });
  it('selectedIndices の重複は duplicate_indices', () => {
    const r = pickLives(allScored(), 1, [1, 1], [1]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('duplicate_indices');
  });
  it('secretIndexes の重複は duplicate_indices', () => {
    const r = pickLives(allScored(), 1, [0, 1], [0, 0]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('duplicate_indices');
  });
  it('secretIndexes が selectedIndices 外なら secret_not_selected', () => {
    const r = pickLives(allScored(), 1, [0, 1], [3]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('secret_not_selected');
  });
  it('allSecret=false で secretIndexes が 2 個以上は secret_count', () => {
    const r = pickLives(allScored(), 1, [0, 1, 2], [0, 1]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('secret_count');
  });
  it('pickable=false の候補を選ぶと not_pickable', () => {
    // flatScore 39 → total 78 >= 77 で全候補 pickable な下地を作り、1 件だけ手動で unpickable にする
    const s = allScored(cfg({ pickMinTotal: 77 }), 39);
    const s2 = structuredClone(s);
    const c = s2.seats[0]?.candidates;
    if (c?.[1]) {
      c[1] = { ...c[1], total: 10, pickable: false };
    }
    const r = pickLives(s2, 1, [0, 1], [0]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_pickable');
  });
  it('二重確定は already_picked', () => {
    const s = unwrap(pickLives(allScored(), 1, [0], [0]));
    const r = pickLives(s, 1, [1], [1]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('already_picked');
  });
  it('全生存席が確定すると battle へ遷移し round=1', () => {
    let s = allScored();
    s = unwrap(pickLives(s, 1, [0, 1], [0]));
    s = unwrap(pickLives(s, 2, [0, 1, 2], [1]));
    expect(s.phase).toBe('picking');
    s = unwrap(pickLives(s, 3, [4], [4]));
    expect(s.phase).toBe('battle');
    expect(s.round).toBe(1);
  });
  it('picking 以外では bad_phase / 脱落席は not_alive', () => {
    expect(pickLives({ ...allScored(), phase: 'battle' }, 1, [0], [0]).ok).toBe(false);
    const s = allScored();
    const dead = structuredClone(s);
    const seat1 = dead.seats[0];
    if (seat1) seat1.alive = false;
    const r = pickLives(dead, 1, [0], [0]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_alive');
  });
  it('存在しない席は no_seat', () => {
    const r = pickLives(allScored(), 99, [0], [0]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('no_seat');
  });
  it('採点前の席は not_scored', () => {
    const s = structuredClone(allScored());
    const seat1 = s.seats[0];
    if (seat1) seat1.candidates = null;
    const r = pickLives(s, 1, [0], [0]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_scored');
  });
});

describe('pickLives（allSecret: true、全ライフ SECRET）', () => {
  it('selectedIndices 全部を secretIndexes にすると受理され secrets が複数になり open は空', () => {
    const s = unwrap(pickLives(allScored(cfg({ allSecret: true })), 1, [0, 2, 4], [0, 2, 4]));
    const seat = s.seats[0];
    expect(seat?.lives?.open).toEqual([]);
    expect(seat?.lives?.secrets.map((x) => x.concept)).toEqual(['概念1-0', '概念1-2', '概念1-4']);
    expect(seat ? lifeCount(seat) : 0).toBe(3);
  });
  it('selectedIndices の一部だけを secretIndexes にすると secret_mismatch', () => {
    const r = pickLives(allScored(cfg({ allSecret: true })), 1, [0, 2, 4], [0, 2]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('secret_mismatch');
  });
});
