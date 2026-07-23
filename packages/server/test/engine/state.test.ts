import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  createGame,
  getSeat,
  isFull,
  removePlayer,
  resetGame,
  setConnected,
  setController,
} from '../../src/engine/state.js';
import { cfg, seated, unwrap } from './helpers.js';

describe('createGame', () => {
  it('waiting フェーズ・空席・round 0 で始まる', () => {
    const s = createGame('ROOM01', cfg());
    expect(s.phase).toBe('waiting');
    expect(s.seats).toEqual([]);
    expect(s.round).toBe(0);
    expect(s.themes).toEqual([]);
    expect(s.winnerSeat).toBeNull();
    expect(s.hostSeat).toBe(1);
  });
});

describe('addPlayer', () => {
  it('席番号 1 から順に割り当てる', () => {
    const s0 = createGame('ROOM01', cfg());
    const r1 = unwrap(addPlayer(s0, 'アリス'));
    expect(r1.seat).toBe(1);
    const r2 = unwrap(addPlayer(r1.state, 'ボブ'));
    expect(r2.seat).toBe(2);
    expect(r2.state.seats.map((x) => x.name)).toEqual(['アリス', 'ボブ']);
  });
  it('CPU は connected=false で座る', () => {
    const r = unwrap(addPlayer(createGame('ROOM01', cfg()), 'CPU・北', 'cpu'));
    expect(r.state.seats[0]?.controller).toBe('cpu');
    expect(r.state.seats[0]?.connected).toBe(false);
  });
  it('満席なら room_full', () => {
    const s = seated(cfg({ playerCount: 2 }));
    const r = addPlayer(s, '3人目');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('room_full');
  });
  it('waiting 以外では bad_phase', () => {
    const s = { ...seated(cfg({ playerCount: 2 })), phase: 'battle' as const };
    const r = addPlayer(s, 'X');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('bad_phase');
  });
  it('入力 state を変異させない（不変性契約）', () => {
    const s0 = createGame('ROOM01', cfg());
    const before = structuredClone(s0);
    addPlayer(s0, 'アリス');
    expect(s0).toEqual(before);
  });
});

describe('isFull / setConnected / setController', () => {
  it('isFull は playerCount 到達で true', () => {
    const c = cfg({ playerCount: 2 });
    let s = createGame('R', c);
    expect(isFull(s)).toBe(false);
    s = unwrap(addPlayer(s, 'A')).state;
    s = unwrap(addPlayer(s, 'B')).state;
    expect(isFull(s)).toBe(true);
  });
  it('setConnected / setController は該当席のみ更新する', () => {
    const s = seated(cfg({ playerCount: 3 }));
    const s2 = unwrap(setConnected(s, 2, false));
    expect(s2.seats[1]?.connected).toBe(false);
    expect(s2.seats[0]?.connected).toBe(true);
    const s3 = unwrap(setController(s2, 2, 'cpu'));
    expect(s3.seats[1]?.controller).toBe('cpu');
  });
  it('存在しない席は no_seat', () => {
    const r = setConnected(seated(), 9, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('no_seat');
  });
  it('setConnected / setController は入力 state を変異させない', () => {
    const s = seated();
    const before = structuredClone(s);
    setConnected(s, 1, false);
    setController(s, 1, 'cpu');
    expect(s).toEqual(before);
  });
  it('getSeat は席を返し、不在席は undefined', () => {
    const s = seated();
    expect(getSeat(s, 2)?.name).toBe('P2');
    expect(getSeat(s, 9)).toBeUndefined();
  });
});

describe('removePlayer', () => {
  it('waiting 中に席を削除し、後続の席番号を詰める', () => {
    let s = seated(cfg({ playerCount: 3 }));
    s = unwrap(removePlayer(s, 2));
    expect(s.seats.map((x) => [x.seat, x.name])).toEqual([
      [1, 'P1'],
      [2, 'P3'],
    ]);
  });
  it('詰めた後の addPlayer は空いた末尾の席番号になる', () => {
    let s = seated(cfg({ playerCount: 3 }));
    s = unwrap(removePlayer(s, 1));
    const r = unwrap(addPlayer(s, '新人'));
    expect(r.seat).toBe(3);
    expect(r.state.seats.map((x) => x.seat)).toEqual([1, 2, 3]);
  });
  it('waiting 以外では bad_phase', () => {
    const r = removePlayer({ ...seated(), phase: 'battle' }, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('bad_phase');
  });
  it('不在席は no_seat', () => {
    const r = removePlayer(seated(), 9);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('no_seat');
  });
});

describe('resetGame', () => {
  it('席メタ（name/controller/connected）を保持しゲームデータを初期化して waiting に戻す', () => {
    let s = seated();
    s = unwrap(setController(s, 2, 'cpu'));
    s = unwrap(setConnected(s, 3, false));
    const mid = { ...s, phase: 'battle' as const, round: 3, themes: ['星座', '航海'] };
    const after = unwrap(resetGame(mid));
    expect(after.phase).toBe('waiting');
    expect(after.round).toBe(0);
    expect(after.themes).toEqual([]);
    expect(after.turns).toEqual([]);
    expect(after.winnerSeat).toBeNull();
    expect(after.seats.map((x) => [x.seat, x.name, x.controller, x.connected])).toEqual([
      [1, 'P1', 'human', true],
      [2, 'P2', 'cpu', true],
      [3, 'P3', 'human', false],
    ]);
    expect(after.seats.every((x) => x.alive && x.lives === null && x.candidates === null)).toBe(
      true,
    );
  });
});
