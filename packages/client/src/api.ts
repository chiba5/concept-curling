import type {
  Ack,
  CreateRoomPayload,
  GameConfig,
  PickLivesPayload,
  RoomJoined,
} from '@concept-curling/shared';
import { DEFAULT_CONFIG } from '@concept-curling/shared';
import { getSocket } from './socket.js';

const ACK_TIMEOUT_MS = 10_000;

function withAck<T>(fire: (cb: (res: Ack<T>) => void) => void): Promise<Ack<T>> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve({ ok: false, code: 'timeout', message: 'サーバ応答がありません' });
      }
    }, ACK_TIMEOUT_MS);
    fire((res) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(res);
      }
    });
  });
}

export const api = {
  createRoom: (p: CreateRoomPayload): Promise<Ack<RoomJoined>> =>
    withAck((cb) => getSocket().emit('room:create', p, cb)),
  /** ソロ導線用: 既定設定でルームを作る（開始は startSolo で） */
  createSoloRoom: (name: string): Promise<Ack<RoomJoined>> =>
    withAck((cb) =>
      getSocket().emit(
        'room:create',
        { name, config: structuredClone(DEFAULT_CONFIG) as GameConfig },
        cb,
      ),
    ),
  joinRoom: (roomId: string, name: string, playerToken?: string): Promise<Ack<RoomJoined>> =>
    withAck((cb) =>
      getSocket().emit(
        'room:join',
        { roomId: roomId.trim().toUpperCase(), name, ...(playerToken ? { playerToken } : {}) },
        cb,
      ),
    ),
  addCpu: (): Promise<Ack> => withAck((cb) => getSocket().emit('room:addCpu', cb)),
  startSolo: (): Promise<Ack> => withAck((cb) => getSocket().emit('room:start', cb)),
  resetGame: (): Promise<Ack> => withAck((cb) => getSocket().emit('room:reset', cb)),
  leaveRoom: (): Promise<Ack> => withAck((cb) => getSocket().emit('room:leave', cb)),
  submitConcepts: (concepts: string[]): Promise<Ack> =>
    withAck((cb) => getSocket().emit('game:submitConcepts', { concepts }, cb)),
  pickLives: (p: PickLivesPayload): Promise<Ack> =>
    withAck((cb) => getSocket().emit('game:pickLives', p, cb)),
  attack: (concept: string): Promise<Ack> =>
    withAck((cb) => getSocket().emit('game:attack', { concept }, cb)),
};

export const session = {
  saveToken: (roomId: string, token: string): void =>
    localStorage.setItem(`cc:token:${roomId}`, token),
  getToken: (roomId: string): string | null => localStorage.getItem(`cc:token:${roomId}`),
  clearToken: (roomId: string): void => localStorage.removeItem(`cc:token:${roomId}`),
  saveName: (name: string): void => localStorage.setItem('cc:name', name),
  getName: (): string => localStorage.getItem('cc:name') ?? '',
};
