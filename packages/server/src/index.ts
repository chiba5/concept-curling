import 'dotenv/config';
import http from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { createScorerFromEnv } from './scoring/index.js';
import { createGameServer, type GameIo } from './socket.js';

const PORT = Number(process.env.PORT ?? 3000);
const server = http.createServer(createApp());
const io: GameIo = new Server(server); // 同一オリジン配信のため CORS 設定は置かない

const scorer = createScorerFromEnv(process.env);
const cpuDelayRaw = process.env.CPU_DELAY_MS;
const cpuDelayMs =
  cpuDelayRaw !== undefined ? { min: Number(cpuDelayRaw), max: Number(cpuDelayRaw) } : undefined;

const manager = createGameServer(io, scorer, { cpuDelayMs });
setInterval(() => manager.sweep(), 60_000).unref();

server.listen(PORT, () =>
  console.log(`http://localhost:${PORT} (scoring: ${scorer.providerName})`),
);
