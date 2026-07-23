import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  Ack,
  ClientToServerEvents,
  PrivateView,
  PublicState,
  RoomJoined,
  ServerToClientEvents,
} from '@concept-curling/shared';
import { DemoScorer } from '../../src/scoring/demo.js';
import { createGameServer, type GameIo } from '../../src/socket.js';
import { DET_CONFIG, until } from '../rooms/helpers.js';

type C = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

let httpServer: HttpServer;
let io: GameIo;
let url = '';
const clients: C[] = [];

interface Client {
  sock: C;
  states: PublicState[];
  privates: PrivateView[];
  last: () => PublicState | undefined;
  lastPriv: () => PrivateView | undefined;
}

beforeAll(async () => {
  httpServer = createServer();
  io = new Server(httpServer);
  createGameServer(io, new DemoScorer(), { cpuDelayMs: { min: 0, max: 0 } });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const c of clients) c.disconnect();
  io.close();
  await new Promise<void>((resolve) => {
    httpServer.close(() => resolve());
  });
});

async function newClient(): Promise<Client> {
  const sock: C = connectClient(url, { transports: ['websocket'] });
  clients.push(sock);
  const states: PublicState[] = [];
  const privates: PrivateView[] = [];
  sock.on('state', (s) => states.push(s));
  sock.on('private', (v) => privates.push(v));
  await new Promise<void>((resolve) => sock.on('connect', () => resolve()));
  return {
    sock,
    states,
    privates,
    last: () => states[states.length - 1],
    lastPriv: () => privates[privates.length - 1],
  };
}

const createRoom = (c: Client, name: string) =>
  new Promise<Ack<RoomJoined>>((r) => c.sock.emit('room:create', { name, config: DET_CONFIG }, r));
const joinRoom = (c: Client, roomId: string, name: string, playerToken?: string) =>
  new Promise<Ack<RoomJoined>>((r) =>
    c.sock.emit('room:join', { roomId, name, ...(playerToken ? { playerToken } : {}) }, r),
  );
const submit = (c: Client, concepts: string[]) =>
  new Promise<Ack>((r) => c.sock.emit('game:submitConcepts', { concepts }, r));
const pick = (c: Client, selectedIndices: number[], secretIndex: number) =>
  new Promise<Ack>((r) => c.sock.emit('game:pickLives', { selectedIndices, secretIndex }, r));
const attack = (c: Client, concept: string) =>
  new Promise<Ack>((r) => c.sock.emit('game:attack', { concept }, r));

describe('socket E2E', () => {
  it('2 クライアントでフルゲームが完走する', async () => {
    const a = await newClient();
    const b = await newClient();
    const created = await createRoom(a, 'アリス');
    expect(created.ok).toBe(true);
    const roomId = created.ok && created.data ? created.data.roomId : '';
    expect(roomId).toMatch(/^[A-Z0-9]{6}$/);
    const joined = await joinRoom(b, roomId, 'ボブ');
    expect(joined.ok).toBe(true);

    await until(() => a.last()?.phase === 'submitting');
    expect((await submit(a, ['灯台', '羊皮紙', '簿記'])).ok).toBe(true);
    expect((await submit(b, ['水平線', '風見鶏', '塩田'])).ok).toBe(true);
    await until(() => a.last()?.phase === 'picking');
    await until(() => (a.lastPriv()?.candidates.length ?? 0) === 3);
    expect((await pick(a, [0], 0)).ok).toBe(true);
    expect((await pick(b, [1], 1)).ok).toBe(true);
    await until(() => a.last()?.phase === 'battle');
    expect((await attack(a, '風見鶏')).ok).toBe(true);
    expect((await attack(b, '油彩')).ok).toBe(true);
    await until(() => a.last()?.phase === 'finished');
    expect(a.last()?.winnerSeat).toBe(1);
    // 非公開情報の境界: ボブの public には破壊前のアリス SECRET が現れない
    expect(JSON.stringify(b.states)).not.toContain('灯台');
  });

  it('切断 → 別ソケット + playerToken で復帰し、myConcepts を受け取る', async () => {
    const a = await newClient();
    const b = await newClient();
    const created = await createRoom(a, 'アリス');
    if (!created.ok || !created.data) throw new Error('create failed');
    const { roomId, playerToken } = created.data;
    await joinRoom(b, roomId, 'ボブ');
    await until(() => a.last()?.phase === 'submitting');
    await submit(a, ['灯台', '羊皮紙', '簿記']);
    a.sock.disconnect();
    const a2 = await newClient();
    const rejoined = await joinRoom(a2, roomId, 'アリス', playerToken);
    expect(rejoined.ok).toBe(true);
    if (rejoined.ok && rejoined.data) expect(rejoined.data.seat).toBe(1);
    await until(() => (a2.lastPriv()?.myConcepts?.length ?? 0) === 3);
    expect(a2.lastPriv()?.myConcepts).toEqual(['灯台', '羊皮紙', '簿記']);
  });

  it('不正 payload は zod で弾かれエラー ack になる', async () => {
    const a = await newClient();
    const bad = await new Promise<Ack<RoomJoined>>((r) =>
      a.sock.emit('room:create', { name: '', config: DET_CONFIG }, r),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toBe('入力が不正です');
  });
});
