import 'dotenv/config';
import http from 'node:http';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT ?? 3000);
const server = http.createServer(createApp());
server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
