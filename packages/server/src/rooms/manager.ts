import { ROOM_GC_MINUTES, ROOM_ID_LENGTH } from '@concept-curling/shared';

/** 紛らわしい文字（I O L 0 1）を除いた大文字英数 */
const ROOM_ID_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomId(): string {
  let id = '';
  for (let i = 0; i < ROOM_ID_LENGTH; i++) {
    id += ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)];
  }
  return id;
}

export interface GcTarget {
  lastActivity: number;
  hasConnectedHumans(): boolean;
  /** GC で削除される際に呼ばれる（タイマー等の後始末。任意） */
  dispose?(): void;
}

/**
 * ルームの台帳。生成は factory 注入（Room への直接依存を避け、単体テスト可能にする）。
 * A は create の追加引数（socket 層は RoomManager<Room, [GameConfig]> として使う）
 */
export class RoomManager<R extends GcTarget, A extends unknown[] = []> {
  private rooms = new Map<string, R>();

  constructor(
    private readonly factory: (id: string, ...args: A) => R,
    private readonly opts: { now?: () => number } = {},
  ) {}

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  create(...args: A): R {
    let id = generateRoomId();
    while (this.rooms.has(id)) id = generateRoomId();
    const room = this.factory(id, ...args);
    this.rooms.set(id, room);
    return room;
  }

  get(id: string): R | undefined {
    return this.rooms.get(id);
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  /** 接続中の人間がおらず ROOM_GC_MINUTES 無活動のルームを削除。削除数を返す */
  sweep(): number {
    const cutoff = this.now() - ROOM_GC_MINUTES * 60 * 1000;
    let removed = 0;
    for (const [id, room] of this.rooms) {
      if (!room.hasConnectedHumans() && room.lastActivity < cutoff) {
        room.dispose?.();
        this.rooms.delete(id);
        removed++;
      }
    }
    return removed;
  }
}
