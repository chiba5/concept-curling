import { afterEach, describe, expect, it, vi } from 'vitest';
import { Room } from '../../src/rooms/room.js';
import { DemoScorer } from '../../src/scoring/demo.js';
import { DET_CONFIG, NO_DELAY, collect, until } from './helpers.js';

describe('待機中退室と再接続', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waiting 中の切断は席を詰め、残った人のトークンが新しい席番号に追随する', async () => {
    const c = collect();
    const room = new Room('R', { ...DET_CONFIG, playerCount: 3 }, new DemoScorer(), c.cb, NO_DELAY);
    const j1 = await room.join('A');
    const j2 = await room.join('B');
    if (!j1.ok || !j2.ok) throw new Error('join failed');
    await room.disconnect(1);
    expect(room.state.seats.map((s) => [s.seat, s.name])).toEqual([[1, 'B']]);
    expect(room.seatOf(j2.value.token)).toBe(1);
    expect(room.seatOf(j1.value.token)).toBeUndefined();
    const j3 = await room.join('C');
    expect(j3.ok).toBe(true);
    if (j3.ok) expect(j3.value.seat).toBe(2);
  });

  it('ゲーム中の切断は猶予内の再接続で復帰できる（席・myConcepts 維持）', async () => {
    const c = collect();
    const room = new Room('R', DET_CONFIG, new DemoScorer(), c.cb, NO_DELAY);
    const j1 = await room.join('A');
    await room.join('B');
    if (!j1.ok) throw new Error('join failed');
    await until(() => c.last()?.phase === 'submitting');
    await room.submitConcepts(1, ['灯台', '羊皮紙', '簿記']);
    await room.disconnect(1);
    expect(room.state.seats[0]?.connected).toBe(false);
    const back = await room.join('A', j1.value.token);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.value.rejoined).toBe(true);
      expect(back.value.seat).toBe(1);
    }
    expect(room.state.seats[0]?.connected).toBe(true);
    expect(c.priv.get(1)?.myConcepts).toEqual(['灯台', '羊皮紙', '簿記']);
  });

  it('猶予超過で CPU 代打になり、代打が提出まで行い、復帰で human に戻る', async () => {
    vi.useFakeTimers();
    const c = collect();
    const room = new Room('R', DET_CONFIG, new DemoScorer(), c.cb, NO_DELAY);
    const j1 = await room.join('A');
    await room.join('B');
    if (!j1.ok) throw new Error('join failed');
    await vi.advanceTimersByTimeAsync(0); // manual テーマの適用キューを消化
    expect(room.state.phase).toBe('submitting');
    await room.disconnect(1);
    await vi.advanceTimersByTimeAsync(DET_CONFIG.graceSeconds * 1000);
    expect(room.state.seats[0]?.controller).toBe('cpu');
    await vi.runOnlyPendingTimersAsync(); // CPU 行動（delay 0）を発火
    await vi.advanceTimersByTimeAsync(0);
    expect(room.state.seats[0]?.submittedConcepts).not.toBeNull();
    const back = await room.join('A', j1.value.token);
    expect(back.ok).toBe(true);
    expect(room.state.seats[0]?.controller).toBe('human');
    expect(room.state.seats[0]?.connected).toBe(true);
  });

  it('猶予内に復帰すれば CPU 代打は発動しない', async () => {
    vi.useFakeTimers();
    const c = collect();
    const room = new Room('R', DET_CONFIG, new DemoScorer(), c.cb, NO_DELAY);
    const j1 = await room.join('A');
    await room.join('B');
    if (!j1.ok) throw new Error('join failed');
    await vi.advanceTimersByTimeAsync(0);
    await room.disconnect(1);
    await vi.advanceTimersByTimeAsync((DET_CONFIG.graceSeconds * 1000) / 2);
    await room.join('A', j1.value.token);
    await vi.advanceTimersByTimeAsync(DET_CONFIG.graceSeconds * 1000);
    expect(room.state.seats[0]?.controller).toBe('human');
  });
});
