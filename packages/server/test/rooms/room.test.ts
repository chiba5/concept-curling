import { describe, expect, it } from 'vitest';
import { DemoScorer } from '../../src/scoring/demo.js';
import { Room } from '../../src/rooms/room.js';
import { DET_CONFIG, NO_DELAY, collect, until } from './helpers.js';

const makeRoom = () => {
  const c = collect();
  const room = new Room('ROOM01', DET_CONFIG, new DemoScorer(), c.cb, NO_DELAY);
  return { c, room };
};

describe('Room 参加と開始', () => {
  it('join は席とトークンを払い出し、満席で theming→(manual)submitting へ自動進行する', async () => {
    const { c, room } = makeRoom();
    const j1 = await room.join('アリス');
    expect(j1.ok).toBe(true);
    if (j1.ok) {
      expect(j1.value.seat).toBe(1);
      expect(j1.value.token).toMatch(/[0-9a-f-]{36}/);
      expect(j1.value.rejoined).toBe(false);
    }
    const j2 = await room.join('ボブ');
    expect(j2.ok).toBe(true);
    await until(() => c.last()?.phase === 'submitting');
    expect(c.last()?.themes).toEqual(['星座', '航海']);
  });
  it('満席後の join は拒否される（bad_phase: 2 人目の join が同一 tick で theming へ自動進行するため room_full ではなく bad_phase になる。詳細は p3-task-5-report.md 参照）', async () => {
    const { room } = makeRoom();
    await room.join('A');
    await room.join('B');
    const r = await room.join('C');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('bad_phase');
  });
  it('addCpu / fillAndStart はホストのみ', async () => {
    const { room } = makeRoom();
    await room.join('A');
    const r1 = await room.addCpu(2);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe('not_host');
    const r2 = await room.fillAndStart(2);
    expect(r2.ok).toBe(false);
    const r3 = await room.addCpu(1);
    expect(r3.ok).toBe(true);
    expect(room.state.seats[1]?.controller).toBe('cpu');
  });
  it('seatOf はトークンから席を引ける', async () => {
    const { room } = makeRoom();
    const j = await room.join('A');
    if (j.ok) expect(room.seatOf(j.value.token)).toBe(1);
    expect(room.seatOf('unknown')).toBeUndefined();
  });
});

describe('Room reset', () => {
  it('ホストの reset で waiting に戻り、全席残存なら即再戦が始まる', async () => {
    const { c, room } = makeRoom();
    await room.join('A');
    await room.join('B');
    await until(() => c.last()?.phase === 'submitting');
    const r = await room.reset(1);
    expect(r.ok).toBe(true);
    // 全席残っているので即 theming→submitting（再戦）
    await until(() => c.last()?.phase === 'submitting');
    expect(room.state.turns).toEqual([]);
  });
  it('ホスト以外の reset は not_host', async () => {
    const { room } = makeRoom();
    await room.join('A');
    await room.join('B');
    const r = await room.reset(2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_host');
  });
});
