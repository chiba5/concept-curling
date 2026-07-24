import { describe, expect, it } from 'vitest';
import { RoomManager, generateRoomId } from '../../src/rooms/manager.js';

interface FakeRoom {
  id: string;
  lastActivity: number;
  connected: boolean;
  disposed: boolean;
  hasConnectedHumans(): boolean;
  dispose(): void;
}

const fakeRoom = (id: string, lastActivity: number, connected: boolean): FakeRoom => ({
  id,
  lastActivity,
  connected,
  disposed: false,
  hasConnectedHumans() {
    return this.connected;
  },
  dispose() {
    this.disposed = true;
  },
});

describe('generateRoomId', () => {
  it('6 文字の大文字英数（紛らわしい文字を除く）を返す', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateRoomId();
      expect(id).toMatch(/^[A-Z0-9]{6}$/);
      expect(id).not.toMatch(/[IOL01]/); // 紛らわしい文字は使わない
    }
  });
});

describe('RoomManager', () => {
  it('create は未使用 ID でルームを登録し、get で取得できる', () => {
    const m = new RoomManager<FakeRoom>((id) => fakeRoom(id, 0, true));
    const r = m.create();
    expect(m.get(r.id)).toBe(r);
    expect(m.get('NOPE99')).toBeUndefined();
    expect(m.roomCount).toBe(1);
  });
  it('sweep は「接続人間ゼロかつ 30 分無活動」のルームだけ削除する', () => {
    let t = 0;
    const m = new RoomManager<FakeRoom>((id) => fakeRoom(id, 0, false), { now: () => t });
    const dead = m.create(); // lastActivity 0, 接続なし
    const alive = m.create();
    alive.connected = true; // 接続あり → 残る
    const recent = m.create();
    t = 31 * 60 * 1000;
    recent.lastActivity = t - 1000; // 最近活動 → 残る
    const removed = m.sweep();
    expect(removed).toBe(1);
    expect(m.get(dead.id)).toBeUndefined();
    expect(m.get(alive.id)).toBeDefined();
    expect(m.get(recent.id)).toBeDefined();
  });
  it('sweep で削除されるルームは dispose() が呼ばれる', () => {
    let t = 0;
    const m = new RoomManager<FakeRoom>((id) => fakeRoom(id, 0, false), { now: () => t });
    const dead = m.create();
    const alive = m.create();
    alive.connected = true;
    t = 31 * 60 * 1000;
    m.sweep();
    expect(dead.disposed).toBe(true);
    expect(alive.disposed).toBe(false);
  });
});
