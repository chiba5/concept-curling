import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  createGame,
  isFull,
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
});
