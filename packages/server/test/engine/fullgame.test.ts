import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  applyScores,
  applyThemes,
  attackPairs,
  createGame,
  pickLives,
  resolveTurn,
  startTheming,
  submitAttack,
  submitConcepts,
  toPublicState,
} from '../../src/engine/index.js';
import { cfg, unwrap } from './helpers.js';

describe('フルゲーム統合（3人・既定ルール）', () => {
  it('待機→テーマ→提出→選抜→バトル2ターン→決着まで一貫して通る', () => {
    let s = createGame('ROOM01', cfg());
    for (const name of ['アリス', 'ボブ', 'CPU・北']) s = unwrap(addPlayer(s, name)).state;
    s = unwrap(startTheming(s));
    s = unwrap(applyThemes(s, ['星座', '航海']));

    // 提出と採点（席3 は全候補 total 40 < 50 で即敗北させる）
    for (const seat of [1, 2, 3]) {
      const concepts = ['灯台', '羊皮紙', '炊飯器', '季節風', '簿記'].map((c) => `${c}${seat}`);
      s = unwrap(submitConcepts(s, seat, concepts));
      const per = seat === 3 ? 20 : 55; // 席3: total 40 / 他: 110
      s = unwrap(
        applyScores(
          s,
          seat,
          concepts.map(() => ({
            scores: [per, per],
            reasons: ['理由', '理由'],
          })),
        ),
      );
    }
    expect(s.phase).toBe('picking');
    expect(s.seats[2]?.alive).toBe(false); // 即敗北

    s = unwrap(pickLives(s, 1, [0, 1], [0])); // SECRET=灯台1, open=羊皮紙1
    s = unwrap(pickLives(s, 2, [0, 1, 2], [2])); // SECRET=炊飯器2
    expect(s.phase).toBe('battle');

    // R1: 席1 が席2 の open を 2 枚破壊、SECRET は無傷
    s = unwrap(submitAttack(s, 1, '嵐')).state;
    const r1 = unwrap(submitAttack(s, 2, '雷'));
    expect(r1.readyToResolve).toBe(true);
    s = r1.state;
    let results = attackPairs(s).map((p) => ({
      score: p.atkSeat === 1 && p.targetSeat === 2 && p.targetKind === 'normal' ? 80 : 10,
      reason: '理由',
    }));
    s = unwrap(resolveTurn(s, results));
    expect(s.phase).toBe('battle');
    expect(s.round).toBe(2);
    expect(toPublicState(s).players[1]?.lifeCount).toBe(1);

    // R2: 席1 が席2 の SECRET を破壊 → 決着
    s = unwrap(submitAttack(s, 1, '調理器具')).state;
    s = unwrap(submitAttack(s, 2, '雹')).state;
    results = attackPairs(s).map((p) => ({
      score: p.targetSeat === 2 && p.targetKind === 'secret' ? 80 : 5,
      reason: '理由',
    }));
    s = unwrap(resolveTurn(s, results));
    expect(s.phase).toBe('finished');
    expect(s.winnerSeat).toBe(1);
    const pub = toPublicState(s);
    expect(pub.players[1]?.revealedSecrets).toEqual(['炊飯器2']);
    expect(pub.turns).toHaveLength(2);
  });
});

describe('フルゲーム統合（2人・カスタムルール）', () => {
  it('人数2・概念3・maxLives1・destroyThreshold30・テーマ1個で完走する', () => {
    const config = cfg({
      playerCount: 2,
      conceptsPerPlayer: 3,
      maxLives: 1,
      destroyThreshold: 30,
      themes: { count: 1, mode: 'manual', manual: ['茶道'] },
      pickMinTotal: 60,
    });
    let s = createGame('ROOM02', config);
    s = unwrap(addPlayer(s, 'A')).state;
    s = unwrap(addPlayer(s, 'B')).state;
    s = unwrap(startTheming(s));
    s = unwrap(applyThemes(s, ['茶道']));
    for (const seat of [1, 2]) {
      s = unwrap(submitConcepts(s, seat, [`甲${seat}`, `乙${seat}`, `丙${seat}`]));
      s = unwrap(
        applyScores(s, seat, [
          { scores: [90], reasons: ['r'] },
          { scores: [70], reasons: ['r'] },
          { scores: [50], reasons: ['r'] }, // 50 < 60 → 丙 は pickable=false
        ]),
      );
    }
    expect(s.phase).toBe('picking');
    s = unwrap(pickLives(s, 1, [0], [0])); // maxLives=1
    s = unwrap(pickLives(s, 2, [1], [1]));
    expect(s.phase).toBe('battle');
    s = unwrap(submitAttack(s, 1, 'X')).state;
    s = unwrap(submitAttack(s, 2, 'Y')).state;
    // 全ペア 40（destroyThreshold 30 超）→ 相打ち全滅
    const after = unwrap(
      resolveTurn(
        s,
        attackPairs(s).map(() => ({ score: 40, reason: 'r' })),
      ),
    );
    expect(after.phase).toBe('finished');
    expect(after.winnerSeat).toBeNull();
  });
});
