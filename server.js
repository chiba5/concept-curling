// server.js
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const MAX_PLAYERS = 3;
const MAX_ROUNDS = 2;

let game = resetGame();
function resetGame() {
  return {
    seats: [], // [{socketId,name,seat}]
    phase: 'waiting', // waiting | playing | finished
    round: 0,
    maxRounds: MAX_ROUNDS,
    submissions: { 1: null, 2: null, 3: null },
    history: [] // [{round, concepts:[{seat,text}], scores:number[][]}]
  };
}
function broadcast() {
  io.emit('state', {
    seats: game.seats.map(s => ({ seat: s.seat, name: s.name })),
    phase: game.phase,
    round: game.round,
    maxRounds: game.maxRounds,
    submittedSeats: [1, 2, 3].filter(s => !!game.submissions[s]),
    history: game.history
  });
}
function seatOf(id) { const s = game.seats.find(v => v.socketId === id); return s ? s.seat : null; }
function allSeated() { return game.seats.length === MAX_PLAYERS; }
function allSubmitted() { return [1, 2, 3].every(s => !!game.submissions[s]); }

// デモ採点（後でLLMに差し替え）
function demoScore(a, b) {
  const norm = s => (s || '').replace(/\s+/g, '').toLowerCase();
  const bi = s => {
    const a = [...s]; if (a.length <= 1) return new Set(a);
    const out = []; for (let i = 0; i < a.length - 1; i++) out.push(a[i] + a[i + 1]);
    return new Set(out);
  };
  const A = bi(norm(a)), B = bi(norm(b));
  if (!A.size && !B.size) return 50;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter;
  const sim = inter / (uni || 1);
  return Math.round(100 * (1 - sim));
}
function matrix(texts) {
  const n = texts.length, M = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const d = demoScore(texts[i], texts[j]); M[i][j] = M[j][i] = d;
  }
  return M;
}

io.on('connection', (socket) => {
  socket.on('join', (name) => {
    if (game.phase === 'finished') game = resetGame();
    if (seatOf(socket.id)) { broadcast(); return; }

    const used = new Set(game.seats.map(s => s.seat));
    let seat = null; for (let i = 1; i <= MAX_PLAYERS; i++) { if (!used.has(i)) { seat = i; break; } }
    if (!seat) { socket.emit('errorMsg', '満席である．'); broadcast(); return; }

    game.seats.push({ socketId: socket.id, name: name || `Player${seat}`, seat });
    if (game.phase === 'waiting' && allSeated()) { game.phase = 'playing'; game.round = 1; }
    broadcast();
  });

  socket.on('submitConcept', (text) => {
    if (game.phase !== 'playing') { return; }
    const seat = seatOf(socket.id); if (!seat) { socket.emit('errorMsg', '座っていない．'); return; }
    if (!allSeated()) { socket.emit('errorMsg', '3人揃うまで待機．'); return; }
    const t = String(text || '').trim(); if (!t) { socket.emit('errorMsg', '空は不可．'); return; }
    if (game.submissions[seat]) { socket.emit('errorMsg', 'このラウンドは提出済．'); return; }

    game.submissions[seat] = t; broadcast();

    if (allSubmitted()) {
      const concepts = [1, 2, 3].map(s => ({ seat: s, text: game.submissions[s] }));
      const scores = matrix(concepts.map(c => c.text));
      game.history.push({ round: game.round, concepts, scores });

      if (game.round >= game.maxRounds) { game.phase = 'finished'; }
      else { game.round += 1; game.submissions = { 1: null, 2: null, 3: null }; }
      broadcast();
    }
  });

  socket.on('resetGame', () => { game = resetGame(); broadcast(); });

  socket.on('disconnect', () => {
    const before = game.seats.length;
    game.seats = game.seats.filter(s => s.socketId !== socket.id);
    if (before !== game.seats.length) { game = resetGame(); }
    broadcast();
  });

  broadcast();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
