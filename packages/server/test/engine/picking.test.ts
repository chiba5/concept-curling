import { describe, expect, it } from 'vitest';
import { pickLives } from '../../src/engine/picking.js';
import { lifeCount } from '../../src/engine/types.js';
import { allScored, cfg, unwrap } from './helpers.js';

// allScored(): 3人・各5概念・全スコア40（total 80 <= 150、全候補 pickable）

describe('pickLives', () => {
  it('選抜を確定し normals / secret に分ける', () => {
    const s = unwrap(pickLives(allScored(), 1, [0, 2, 4], 2));
    const seat = s.seats[0];
    expect(seat?.lives?.normals).toEqual(['概念1-0', '概念1-4']);
    expect(seat?.lives?.secret).toEqual({ concept: '概念1-2', destroyed: false, revealed: false });
    expect(seat ? lifeCount(seat) : 0).toBe(3);
  });
  it('1 個選択なら必然的にそれが SECRET', () => {
    const s = unwrap(pickLives(allScored(), 1, [3], 3));
    expect(s.seats[0]?.lives?.normals).toEqual([]);
    expect(s.seats[0]?.lives?.secret?.concept).toBe('概念1-3');
  });
  it('maxLives 超の選択は too_many', () => {
    const r = pickLives(allScored(cfg({ maxLives: 2 })), 1, [0, 1, 2], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('too_many');
  });
  it('範囲外インデックスは out_of_range', () => {
    const r = pickLives(allScored(), 1, [0, 9], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('out_of_range');
  });
  it('重複インデックスは duplicate_indices', () => {
    const r = pickLives(allScored(), 1, [1, 1], 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('duplicate_indices');
  });
  it('secretIndex が選択外なら secret_not_selected', () => {
    const r = pickLives(allScored(), 1, [0, 1], 3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('secret_not_selected');
  });
  it('pickable=false の候補を選ぶと not_pickable', () => {
    // flatScore 80 → total 160 > 150 で全候補 pickable=false だが、その場合は既に即敗北している。
    // 混在ケースを作る: pickSumLimit をぎりぎりに調整（total 80 <= 79 は false）
    const s = allScored(cfg({ pickSumLimit: 79 }), 39); // total 78 <= 79 → pickable
    const s2 = structuredClone(s);
    const c = s2.seats[0]?.candidates;
    if (c?.[1]) {
      c[1] = { ...c[1], total: 200, pickable: false };
    }
    const r = pickLives(s2, 1, [0, 1], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_pickable');
  });
  it('二重確定は already_picked', () => {
    const s = unwrap(pickLives(allScored(), 1, [0], 0));
    const r = pickLives(s, 1, [1], 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('already_picked');
  });
  it('全生存席が確定すると battle へ遷移し round=1', () => {
    let s = allScored();
    s = unwrap(pickLives(s, 1, [0, 1], 0));
    s = unwrap(pickLives(s, 2, [0, 1, 2], 1));
    expect(s.phase).toBe('picking');
    s = unwrap(pickLives(s, 3, [4], 4));
    expect(s.phase).toBe('battle');
    expect(s.round).toBe(1);
  });
  it('picking 以外では bad_phase / 脱落席は not_alive', () => {
    expect(pickLives({ ...allScored(), phase: 'battle' }, 1, [0], 0).ok).toBe(false);
    const s = allScored();
    const dead = structuredClone(s);
    const seat1 = dead.seats[0];
    if (seat1) seat1.alive = false;
    const r = pickLives(dead, 1, [0], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_alive');
  });
});
