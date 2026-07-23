import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { DEFAULT_CONFIG } from '@concept-curling/shared';

const clientDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../client/dist',
);

export function createApp(): express.Express {
  const app = express();
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  // shared を実際に import しておく（配線検証。P3 で本格利用）
  app.get('/api/default-config', (_req, res) => res.json(DEFAULT_CONFIG));
  app.use(express.static(clientDist));
  // SPA fallback（/room/:id 直リンク用）
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  return app;
}
