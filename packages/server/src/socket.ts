import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  GameConfig,
  ServerToClientEvents,
} from '@concept-curling/shared';
import {
  attackSchema,
  createRoomSchema,
  joinRoomSchema,
  pickLivesSchema,
  submitConceptsSchema,
} from '@concept-curling/shared';
import { RoomManager } from './rooms/manager.js';
import { Room } from './rooms/room.js';
import type { Scorer } from './scoring/scorer.js';

export interface SocketData {
  roomId?: string;
  token?: string;
}

export type GameIo = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface GameServerOptions {
  cpuDelayMs?: { min: number; max: number };
}

/** socket.io 配線: zod 検証 + ack 変換 + token ルーティングのみ。ゲーム判断はすべて Room */
export function createGameServer(
  io: GameIo,
  scorer: Scorer,
  opts: GameServerOptions = {},
): RoomManager<Room, [GameConfig]> {
  const tokenSockets = new Map<string, Sock>();

  const manager = new RoomManager<Room, [GameConfig]>(
    (id, config) =>
      new Room(
        id,
        config,
        scorer,
        {
          onPublic: (state) => io.to(id).emit('state', state),
          onPrivate: (_seat, view) => tokenSockets.get(view.playerToken)?.emit('private', view),
        },
        { cpuDelayMs: opts.cpuDelayMs },
      ),
  );

  io.on('connection', (socket: Sock) => {
    const bind = (roomId: string, token: string): void => {
      const prevRoomId = socket.data.roomId;
      const prevToken = socket.data.token;
      if (prevToken && prevToken !== token) {
        if (tokenSockets.get(prevToken) === socket) tokenSockets.delete(prevToken);
        if (prevRoomId && prevRoomId !== roomId) {
          void socket.leave(prevRoomId);
          const prevRoom = manager.get(prevRoomId);
          const prevSeat = prevRoom?.seatOf(prevToken);
          if (prevRoom && prevSeat !== undefined) void prevRoom.disconnect(prevSeat);
        }
      }
      socket.data.roomId = roomId;
      socket.data.token = token;
      tokenSockets.set(token, socket);
      void socket.join(roomId);
    };

    const located = (): { room: Room; seat: number } | null => {
      const { roomId, token } = socket.data;
      if (!roomId || !token) return null;
      const room = manager.get(roomId);
      const seat = room?.seatOf(token);
      if (!room || seat === undefined) return null;
      return { room, seat };
    };

    const guarded = (
      fn: () => Promise<void>,
      ack: (res: { ok: false; code?: string; message: string }) => void,
    ): void => {
      void fn().catch(() => {
        try {
          ack({ ok: false, code: 'internal', message: 'サーバエラーが発生しました' });
        } catch {
          /* ack already sent */
        }
      });
    };

    socket.on('room:create', (payload, ack) => {
      guarded(async () => {
        const p = createRoomSchema.safeParse(payload);
        if (!p.success) return ack({ ok: false, code: 'invalid_input', message: '入力が不正です' });
        const room = manager.create(p.data.config);
        const r = await room.join(p.data.name);
        if (!r.ok) return ack({ ok: false, code: r.error.code, message: r.error.message });
        bind(room.id, r.value.token);
        await room.refresh();
        ack({
          ok: true,
          data: { roomId: room.id, seat: r.value.seat, playerToken: r.value.token },
        });
      }, ack);
    });

    socket.on('room:join', (payload, ack) => {
      guarded(async () => {
        const p = joinRoomSchema.safeParse(payload);
        if (!p.success) return ack({ ok: false, code: 'invalid_input', message: '入力が不正です' });
        const room = manager.get(p.data.roomId);
        if (!room)
          return ack({ ok: false, code: 'room_not_found', message: 'ルームが見つかりません' });
        const r = await room.join(p.data.name, p.data.playerToken);
        if (!r.ok) return ack({ ok: false, code: r.error.code, message: r.error.message });
        bind(room.id, r.value.token);
        await room.refresh();
        ack({
          ok: true,
          data: { roomId: room.id, seat: r.value.seat, playerToken: r.value.token },
        });
      }, ack);
    });

    socket.on('room:addCpu', (ack) => {
      guarded(async () => {
        const loc = located();
        if (!loc)
          return ack({ ok: false, code: 'not_in_room', message: 'ルームに参加していません' });
        const r = await loc.room.addCpu(loc.seat);
        ack(r.ok ? { ok: true } : { ok: false, code: r.error.code, message: r.error.message });
      }, ack);
    });

    socket.on('room:start', (ack) => {
      guarded(async () => {
        const loc = located();
        if (!loc)
          return ack({ ok: false, code: 'not_in_room', message: 'ルームに参加していません' });
        const r = await loc.room.fillAndStart(loc.seat);
        ack(r.ok ? { ok: true } : { ok: false, code: r.error.code, message: r.error.message });
      }, ack);
    });

    socket.on('room:reset', (ack) => {
      guarded(async () => {
        const loc = located();
        if (!loc)
          return ack({ ok: false, code: 'not_in_room', message: 'ルームに参加していません' });
        const r = await loc.room.reset(loc.seat);
        ack(r.ok ? { ok: true } : { ok: false, code: r.error.code, message: r.error.message });
      }, ack);
    });

    socket.on('room:leave', (ack) => {
      guarded(async () => {
        const loc = located();
        if (!loc)
          return ack({ ok: false, code: 'not_in_room', message: 'ルームに参加していません' });
        const { roomId, token } = socket.data;
        if (token && tokenSockets.get(token) === socket) tokenSockets.delete(token);
        if (roomId) void socket.leave(roomId);
        socket.data.roomId = undefined;
        socket.data.token = undefined;
        await loc.room.disconnect(loc.seat);
        ack({ ok: true });
      }, ack);
    });

    socket.on('game:submitConcepts', (payload, ack) => {
      guarded(async () => {
        const loc = located();
        if (!loc)
          return ack({ ok: false, code: 'not_in_room', message: 'ルームに参加していません' });
        const p = submitConceptsSchema.safeParse(payload);
        if (!p.success) return ack({ ok: false, code: 'invalid_input', message: '入力が不正です' });
        const r = await loc.room.submitConcepts(loc.seat, p.data.concepts);
        ack(r.ok ? { ok: true } : { ok: false, code: r.error.code, message: r.error.message });
      }, ack);
    });

    socket.on('game:pickLives', (payload, ack) => {
      guarded(async () => {
        const loc = located();
        if (!loc)
          return ack({ ok: false, code: 'not_in_room', message: 'ルームに参加していません' });
        const p = pickLivesSchema.safeParse(payload);
        if (!p.success) return ack({ ok: false, code: 'invalid_input', message: '入力が不正です' });
        const r = await loc.room.pickLives(loc.seat, p.data.selectedIndices, p.data.secretIndexes);
        ack(r.ok ? { ok: true } : { ok: false, code: r.error.code, message: r.error.message });
      }, ack);
    });

    socket.on('game:attack', (payload, ack) => {
      guarded(async () => {
        const loc = located();
        if (!loc)
          return ack({ ok: false, code: 'not_in_room', message: 'ルームに参加していません' });
        const p = attackSchema.safeParse(payload);
        if (!p.success) return ack({ ok: false, code: 'invalid_input', message: '入力が不正です' });
        const r = await loc.room.attack(loc.seat, p.data.concept);
        ack(r.ok ? { ok: true } : { ok: false, code: r.error.code, message: r.error.message });
      }, ack);
    });

    socket.on('disconnect', () => {
      const { roomId, token } = socket.data;
      if (!roomId || !token) return;
      if (tokenSockets.get(token) !== socket) return; // 別ソケットで再接続済みなら何もしない
      tokenSockets.delete(token);
      const room = manager.get(roomId);
      const seat = room?.seatOf(token);
      if (room && seat !== undefined) void room.disconnect(seat);
    });
  });

  return manager;
}
