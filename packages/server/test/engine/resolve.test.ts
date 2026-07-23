import { describe, expect, it } from 'vitest';
import { attackPairs, submitAttack } from '../../src/engine/battle.js';
import { resolveTurn } from '../../src/engine/resolve.js';
import { lifeCount } from '../../src/engine/types.js';
import { cfg, inBattle, unwrap } from './helpers.js';
import type { GameState } from '../../src/engine/types.js';

/** 2人戦で両者攻撃済みの状態を作る */
function ready2p(): GameState {
  let s = inBattle(cfg({ playerCount: 2 }));
  s = unwrap(submitAttack(s, 1, '嵐')).state;
  return unwrap(submitAttack(s, 2, '雷')).state;
}

/** 全ペア一律スコアの results を作る */
function flatResults(s: GameState, score: number) {
  return attackPairs(s).map(() => ({ score, reason: '理由' }));
}

/** 特定ペアだけ狙い撃ちするユーティリティ */
function targeted(
  s: GameState,
  hit: (p: ReturnType<typeof attackPairs>[number]) => boolean,
  hitScore: number,
  missScore = 90,
) {
  return attackPairs(s).map((p) => ({ score: hit(p) ? hitScore : missScore, reason: '理由' }));
}

describe('resolveTurn', () => {
  it('破壊帯 [10,50) のライフを破壊し、境界値が正しい', () => {
    for (const [score, destroyed] of [
      [9, false],
      [10, true],
      [49, true],
      [50, false],
    ] as const) {
      const s = ready2p();
      const results = targeted(
        s,
        (p) => p.atkSeat === 1 && p.targetSeat === 2 && p.targetConcept === '概念2-1',
        score,
      );
      const after = unwrap(resolveTurn(s, results));
      const normals = after.seats[1]?.lives?.normals ?? [];
      expect(normals.includes('概念2-1')).toBe(!destroyed);
    }
  });
  it('SECRET 破壊で公開され reveals に記録される', () => {
    const s = ready2p();
    const results = targeted(
      s,
      (p) => p.atkSeat === 1 && p.targetSeat === 2 && p.targetKind === 'secret',
      30,
    );
    const after = unwrap(resolveTurn(s, results));
    expect(after.seats[1]?.lives?.secret).toEqual({
      concept: '概念2-0',
      destroyed: true,
      revealed: true,
    });
    expect(after.turns[0]?.reveals).toEqual([{ seat: 2, concept: '概念2-0' }]);
  });
  it('details: 未公開 SECRET は targetLabel=SECRET、破壊された行以降は概念名', () => {
    const s = ready2p();
    // 攻撃者1 が席2 の SECRET を破壊 → 攻撃者2 視点の同 SECRET 行（後続）は概念名で記録される
    const results = targeted(
      s,
      (p) => p.atkSeat === 1 && p.targetSeat === 2 && p.targetKind === 'secret',
      30,
    );
    const after = unwrap(resolveTurn(s, results));
    const secretRows =
      after.turns[0]?.details.filter((d) => d.targetSeat === 2 && d.targetKind === 'secret') ?? [];
    expect(secretRows[0]?.targetLabel).toBe('SECRET'); // 破壊行自身は破壊前ラベル
    expect(secretRows[1]?.targetLabel).toBe('概念2-0'); // 破壊後の行は公開済み
    expect(secretRows[0]?.destroyed).toBe(true);
    expect(secretRows[1]?.destroyed).toBe(false); // 既に破壊済みなので再破壊しない
  });
  it('自分の攻撃が自分のライフも破壊しうる（現行ルール踏襲）', () => {
    const s = ready2p();
    const results = targeted(
      s,
      (p) => p.atkSeat === 1 && p.targetSeat === 1 && p.targetConcept === '概念1-1',
      30,
    );
    const after = unwrap(resolveTurn(s, results));
    expect(after.seats[0]?.lives?.normals).not.toContain('概念1-1');
  });
  it('全ライフ喪失で脱落し、生存 1 名なら finished + 勝者', () => {
    const s = ready2p();
    const results = targeted(s, (p) => p.targetSeat === 2, 30); // 席2 の全ライフ破壊
    const after = unwrap(resolveTurn(s, results));
    expect(after.seats[1]?.alive).toBe(false);
    expect(after.turns[0]?.eliminatedSeats).toEqual([2]);
    expect(after.phase).toBe('finished');
    expect(after.winnerSeat).toBe(1);
  });
  it('相打ち全滅なら winnerSeat=null で finished', () => {
    const s = ready2p();
    const after = unwrap(resolveTurn(s, flatResults(s, 30))); // 全ペア破壊帯
    expect(after.seats.every((x) => !x.alive)).toBe(true);
    expect(after.phase).toBe('finished');
    expect(after.winnerSeat).toBeNull();
  });
  it('継続時は round+1・攻撃クリア・TurnRecord 追記', () => {
    const s = ready2p();
    const after = unwrap(resolveTurn(s, flatResults(s, 90))); // 誰も破壊されない
    expect(after.phase).toBe('battle');
    expect(after.round).toBe(2);
    expect(after.seats.every((x) => x.attack === null)).toBe(true);
    expect(after.turns).toHaveLength(1);
    expect(after.turns[0]?.round).toBe(1);
    expect(after.turns[0]?.attacks).toEqual([
      { seat: 1, concept: '嵐' },
      { seat: 2, concept: '雷' },
    ]);
    expect(after.turns[0]?.details.every((d) => d.reason === '理由')).toBe(true);
  });
  it('3人戦: 1 ターンで 2 名同時脱落 → 残り 1 名が勝者', () => {
    let s = inBattle(); // 3人
    s = unwrap(submitAttack(s, 1, '嵐')).state;
    s = unwrap(submitAttack(s, 2, '雷')).state;
    s = unwrap(submitAttack(s, 3, '霧')).state;
    const results = targeted(s, (p) => p.targetSeat !== 3, 30);
    const after = unwrap(resolveTurn(s, results));
    expect(after.turns[0]?.eliminatedSeats).toEqual([1, 2]);
    expect(after.winnerSeat).toBe(3);
  });
  it('未提出者がいると not_ready、results 長不一致は result_shape', () => {
    let s = inBattle(cfg({ playerCount: 2 }));
    s = unwrap(submitAttack(s, 1, '嵐')).state;
    const r = resolveTurn(s, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_ready');
    const s2 = ready2p();
    const r2 = resolveTurn(s2, flatResults(s2, 30).slice(0, 3));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe('result_shape');
  });
  it('lifeCount が破壊を反映する', () => {
    const s = ready2p();
    const results = targeted(s, (p) => p.targetSeat === 2 && p.targetKind === 'normal', 30);
    const after = unwrap(resolveTurn(s, results));
    const seat2 = after.seats[1];
    expect(seat2 ? lifeCount(seat2) : -1).toBe(1); // SECRET のみ残存
  });
});
