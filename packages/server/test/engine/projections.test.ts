import { describe, expect, it } from 'vitest';
import { submitAttack } from '../../src/engine/battle.js';
import { pickLives } from '../../src/engine/picking.js';
import { toPrivateView, toPublicState } from '../../src/engine/projections.js';
import { submitConcepts } from '../../src/engine/submitting.js';
import { allScored, cfg, inBattle, inSubmitting, unwrap } from './helpers.js';

describe('toPublicState', () => {
  it('SECRET の概念と他人の candidates を含まない', () => {
    const pub = toPublicState(inBattle());
    const p1 = pub.players[0];
    expect(p1?.livesPublic).toEqual(['概念1-1', '概念1-2']);
    expect(p1?.revealedSecrets).toEqual([]);
    expect(p1?.secretCount).toBe(1);
    expect(JSON.stringify(pub)).not.toContain('candidates');
    expect(pub.players.every((p) => p.lifeCount === 3)).toBe(true);
  });
  it('ready: submitting は提出済みか、picking は選抜済みか、battle は攻撃済みかを表す', () => {
    const sub = inSubmitting();
    expect(toPublicState(sub).players.every((p) => !p.ready)).toBe(true);
    const scored = allScored();
    expect(toPublicState(scored).players.every((p) => !p.ready)).toBe(true); // picking で未選抜
    let b = inBattle();
    b = unwrap(submitAttack(b, 2, '嵐')).state;
    const pub = toPublicState(b);
    expect(pub.players.map((p) => p.ready)).toEqual([false, true, false]);
  });
  it('config / themes / turns / hostSeat を素通しする', () => {
    const pub = toPublicState(inBattle(cfg({ playerCount: 2 })));
    expect(pub.config.playerCount).toBe(2);
    expect(pub.themes).toEqual(['星座', '航海']);
    expect(pub.hostSeat).toBe(1);
    expect(pub.roomId).toBe('ROOM01');
  });
  it('未公開 SECRET の概念文字列が公開 state に一切現れない', () => {
    const pub = toPublicState(inBattle());
    expect(JSON.stringify(pub)).not.toContain('概念1-0');
  });
  it('脱落席の ready は常に false / 選抜済みの ready は true', () => {
    let s = allScored();
    s = unwrap(pickLives(s, 1, [0], [0]));
    const dead = structuredClone(s);
    const seat2 = dead.seats[1];
    if (seat2) seat2.alive = false;
    const pub = toPublicState(dead);
    expect(pub.players[0]?.ready).toBe(true);
    expect(pub.players[1]?.ready).toBe(false);
  });
  it('graceDeadline は既定で null', () => {
    const pub = toPublicState(inBattle());
    expect(pub.players.every((p) => p.graceDeadline === null)).toBe(true);
  });
  it('finished では未破壊 SECRET も公開される', () => {
    const s = structuredClone(inBattle());
    s.phase = 'finished';
    s.winnerSeat = 1;
    const pub = toPublicState(s);
    expect(pub.players[0]?.revealedSecrets).toEqual(['概念1-0']);
    expect(pub.players[1]?.revealedSecrets).toEqual(['概念2-0']);
  });
  it('finished 以外では未破壊 SECRET は公開されない（回帰）', () => {
    const pub = toPublicState(inBattle());
    expect(pub.players.every((p) => p.revealedSecrets.length === 0)).toBe(true);
  });
  it('allSecret では livesPublic が常に空で secretCount がライフ数と一致する', () => {
    const pub = toPublicState(inBattle(cfg({ allSecret: true })));
    expect(pub.players.every((p) => p.livesPublic.length === 0)).toBe(true);
    expect(pub.players.every((p) => p.secretCount === p.lifeCount)).toBe(true);
  });
});

describe('toPrivateView', () => {
  it('自席の candidates と SECRET 実体を含む', () => {
    const v = toPrivateView(allScored(), 1, 'token-1');
    expect(v.seat).toBe(1);
    expect(v.playerToken).toBe('token-1');
    expect(v.candidates).toHaveLength(5);
    expect(v.myLives).toEqual({ open: [], secrets: [] });
  });
  it('選抜後は自分の SECRET が見える', () => {
    const v = toPrivateView(inBattle(), 1, 't');
    expect(v.myLives.secrets).toEqual([{ concept: '概念1-0', destroyed: false }]);
    expect(v.myLives.open).toEqual(['概念1-1', '概念1-2']);
  });
  it('採点前は candidates が空配列', () => {
    const v = toPrivateView(inSubmitting(), 1, 't');
    expect(v.candidates).toEqual([]);
  });
  it('attackSubmitted を反映する', () => {
    const b = unwrap(submitAttack(inBattle(), 1, '嵐')).state;
    expect(toPrivateView(b, 1, 't').attackSubmitted).toBe(true);
    expect(toPrivateView(b, 2, 't').attackSubmitted).toBe(false);
  });
  it('提出済み概念 myConcepts を採点前から復元できる', () => {
    let s = inSubmitting();
    expect(toPrivateView(s, 1, 't').myConcepts).toBeNull();
    s = unwrap(submitConcepts(s, 1, ['灯台', '羊皮紙', '炊飯器', '季節風', '簿記']));
    expect(toPrivateView(s, 1, 't').myConcepts).toEqual([
      '灯台',
      '羊皮紙',
      '炊飯器',
      '季節風',
      '簿記',
    ]);
  });
});
