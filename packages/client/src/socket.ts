import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@concept-curling/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

/** 同一オリジン接続のシングルトン。テストでは vi.mock で差し替える */
export function getSocket(): GameSocket {
  socket ??= io({ transports: ['websocket', 'polling'] });
  return socket;
}
