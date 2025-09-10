// server.js
require('dotenv').config();

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_TEMPERATURE = parseFloat(process.env.OPENAI_TEMPERATURE || '0.2');

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const MAX_PLAYERS = 3;

const PICK_SUM_LIMIT = 150; // ライフ選抜の合計上限

const Phase = {
  WAIT: 'waiting',
  THEME: 'theme',
  P5_INPUT: 'private5_input',
  P5_SCORED: 'private5_scored',   // 内部的（全員採点済みフラグ）
  LIFE_PICK: 'life_pick',
  LIFE_REVEAL: 'life_reveal',
  BATTLE: 'battle',
  FINISHED: 'finished'
};


let game = resetGame();

function resetGame() {
  return {
    phase: Phase.WAIT,
    round: 0,
    themes: [],                   // [Concept, Concept]
    relCache: new Map(),          // "a|b" -> 0..100
    players: [
      null,
      { seat: 1, name: null, socketId: null, alive: false, privateInputs: [], privateScores: [], life: { normals: [], secret: null }, lifeCount: 0, attack: null },
      { seat: 2, name: null, socketId: null, alive: false, privateInputs: [], privateScores: [], life: { normals: [], secret: null }, lifeCount: 0, attack: null },
      { seat: 3, name: null, socketId: null, alive: false, privateInputs: [], privateScores: [], life: { normals: [], secret: null }, lifeCount: 0, attack: null },
    ],
    // ログ（公開）
    history: {
      privateDone: [],       // 座席が5件提出＆採点済
      lifePicked: [],        // 座席がライフ確定
      turns: []              // [{round, attacks:[{seat,concept}], destroys:[{owner,which,concept,isSecret}], reveals:[{owner,concept}]}]
    }
  };
}


// 共通：LLM呼び出し（chat.completions, JSON出力）
async function callLLMJson({ system, user }) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: OPENAI_TEMPERATURE,
      response_format: { type: "json_object" },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI HTTP ${res.status} ${t}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '{}';
  return JSON.parse(text);
}


// ------- ブロードキャスト（公開情報のみ） -------
function broadcast() {
  const pubPlayers = [1, 2, 3].map(seat => {
    const p = game.players[seat];
    return {
      seat,
      name: p.name,
      alive: p.alive,
      lifeCount: p.lifeCount,
      livesPublic: p.life.normals,                  // 公開ライフ（2以下）
      secretRevealed: p.life.secret && p.life.secret._revealed ? p.life.secret.concept : null
    };
  });
  io.emit('state', {
    phase: game.phase,
    round: game.round,
    themes: game.themes,
    players: pubPlayers,
    history: game.history,
    pickSumLimit: PICK_SUM_LIMIT,
  });
}

// 個別に送る（非公開情報）
function sendPrivate(socket, seat) {
  const p = game.players[seat];
  socket.emit('privateView', {
    seat,
    privateInputs: p.privateInputs,
    privateScores: p.privateScores,     // [[t1,t2], ...]
    lifeMine: {
      normals: p.life.normals,
      secret: p.life.secret ? (p.life.secret._revealed ? p.life.secret.concept : '(SECRET)') : null,
      secretActual: p.life.secret ? p.life.secret.concept : null
    }
  });
}

function allSeated() { return [1, 2, 3].every(s => !!game.players[s].socketId); }
function aliveSeats() { return [1, 2, 3].filter(s => game.players[s].alive); }

async function generateThemesLLM() {
  const system = `あなたは抽象と具象をバランスよく提示するキュレーター。
出力は必ずJSONのみ。日本語で、意味の離れた2つのテーマを毎回変えて生成する。`;
  const user = `要件:
- 日本語テーマを2つ。
- 長さは1〜6文字程度の短い名詞や造語（例:「スマホ」「星」「攻撃」「スーパー」など）
- 抽象/具象が混在し、互いに離れすぎず近すぎない中距離感。
- ゲーム内で比較に使いやすいもの。
- 2つのテーマは、互いに完全に無関係にしない。一般的な文脈で連想可能な中距離感（例: 「コーヒー」と「町」/「星座」と「航海」）。
- あまりに抽象的・専門的すぎる語は避ける。


出力:
{"themes":["テーマA","テーマB"]}`;

  try {
    const json = await callLLMJson({ system, user });
    const arr = Array.isArray(json.themes) ? json.themes.slice(0, 2) : [];
    if (arr.length === 2 && arr.every(x => typeof x === 'string' && x.trim())) {
      return arr;
    }
    throw new Error('invalid themes json');
  } catch (e) {
    // フォールバック（以前のデモテーマ）
    const pool = ["空理", "樹状", "レゾナンス"];
    const pick = () => pool[Math.floor(Math.random() * pool.length)];
    return [pick(), pick()];
  }
}


// ------- 距離（無関係度）0..100（後でLLMに置換） -------
function relScore(a, b) {
  const key = normalize(a) + '|' + normalize(b);
  if (game.relCache.has(key)) return game.relCache.get(key);
  const v = demoScore(a, b);
  game.relCache.set(key, v);
  return v;
}

function normalize(s) { return String(s || '').trim().toLowerCase(); }
function demoScore(a, b) {
  const bi = s => {
    const arr = [...s]; if (arr.length <= 1) return new Set(arr);
    const out = []; for (let i = 0; i < arr.length - 1; i++) out.push(arr[i] + arr[i + 1]);
    return new Set(out);
  };
  const A = bi(normalize(a)), B = bi(normalize(b));
  if (!A.size && !B.size) return 50;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter;
  const sim = inter / (uni || 1);
  return Math.round(100 * (1 - sim)); // 0=深い, 100=浅い
}

// ------- 判定ユーティリティ -------
function sumTwoThemeScore(concept) {
  return relScore(concept, game.themes[0]) + relScore(concept, game.themes[1]);
}

// ------- ソケット -------
io.on('connection', (socket) => {
  socket.on('join', (name) => {
    // 空席にアサイン
    let seat = [1, 2, 3].find(s => !game.players[s].socketId);
    if (!seat) { socket.emit('errorMsg', '満席'); sendPrivate(socket, 0); return; }
    const p = game.players[seat];
    p.socketId = socket.id;
    p.name = name || `Player${seat}`;
    p.alive = true;

    // 3人揃ったらテーマへ
    if (game.phase === Phase.WAIT && allSeated()) {
      game.phase = Phase.THEME;
      // LLMでテーマ生成
      generateThemesLLM().then(themes => {
        game.themes = themes;
        // 直ちに5件入力へ
        game.phase = Phase.P5_INPUT;
        broadcast();
      }).catch(() => {
        // フォールバック
        game.themes = ["断章", "無音帯"];
        game.phase = Phase.P5_INPUT;
        broadcast();
      });
    } else {
      broadcast();
    }
    broadcast();
    sendPrivate(socket, seat);
  });

  // 5つの非公開入力（配列で一括送信）
  socket.on('submitPrivateFive', (list) => {
    if (game.phase !== Phase.P5_INPUT) return;
    const seat = findSeatBySocket(socket.id); if (!seat) return;
    const p = game.players[seat];
    if (!Array.isArray(list) || list.length !== 5) { socket.emit('errorMsg', '5件ちょうだい'); return; }
    const cleaned = list.map(x => String(x || '').trim()).filter(x => x.length > 0);
    if (cleaned.length !== 5) { socket.emit('errorMsg', '空行は不可'); return; }

    // ...cleaned 作成までは現状通り

    p.privateInputs = cleaned.map(concept => ({ concept }));

    // ここをバッチ化
    const pairs = [];
    for (const concept of cleaned) {
      pairs.push({ a: concept, b: game.themes[0] });
      pairs.push({ a: concept, b: game.themes[1] });
    }
    scorePairsLLM(pairs).then(scores => {
      // scores は [c1-t1, c1-t2, c2-t1, c2-t2, ...]
      const table = [];
      for (let i = 0; i < cleaned.length; i++) {
        const s1 = scores[i * 2], s2 = scores[i * 2 + 1];
        table.push([s1, s2]);
      }
      p.privateScores = normalizeScoresForPick(table);
      if (!game.history.privateDone.includes(seat)) game.history.privateDone.push(seat);

      if ([1, 2, 3].every(s => game.players[s].privateInputs.length === 5)) {
        game.phase = Phase.LIFE_PICK;
      }
      broadcast();
      sendPrivate(socket, seat);
    }).catch(err => {
      // フォールバック（デモ）
      p.privateScores = cleaned.map(concept => ([
        relScore(concept, game.themes[0]),
        relScore(concept, game.themes[1])
      ]));
      if (!game.history.privateDone.includes(seat)) game.history.privateDone.push(seat);
      if ([1, 2, 3].every(s => game.players[s].privateInputs.length === 5)) {
        game.phase = Phase.LIFE_PICK;
      }
      broadcast();
      sendPrivate(socket, seat);
    });

  });

  // ライフ選抜（selected: index配列[最大3], secretIndex: その中の1つ）
  socket.on('pickLives', ({ selected, secretIndex }) => {
    if (game.phase !== Phase.LIFE_PICK) return;

    const seat = findSeatBySocket(socket.id);
    if (!seat) return;

    const p = game.players[seat];

    // すでに選び終えていたら拒否
    if (p.lifeCount > 0) {
      socket.emit('errorMsg', '既に選択済み');
      return;
    }

    // 引数バリデーション
    if (!Array.isArray(selected) || selected.length < 1 || selected.length > 3) {
      socket.emit('errorMsg', '1〜3件を選択');
      return;
    }
    if (typeof secretIndex !== 'number' || secretIndex < 0 || secretIndex >= selected.length) {
      socket.emit('errorMsg', 'シークレットの指定が不正');
      return;
    }

    // 条件チェック：各候補の合計 <= PICK_SUM_LIMIT
    const chosen = [];
    for (const idx of selected) {
      const c = p.privateInputs[idx];
      if (!c) {
        socket.emit('errorMsg', '範囲外');
        return;
      }
      const sc = p.privateScores[idx]; // [テーマA, テーマB]
      if (!sc) {
        socket.emit('errorMsg', 'スコア未計算');
        return;
      }
      const sum = sc[0] + sc[1];
      if (sum <= PICK_SUM_LIMIT) {
        chosen.push({ concept: c.concept, sum });
      }
    }

    // 一つも条件を満たさない → 即敗北
    if (chosen.length === 0) {
      p.alive = false;
      p.lifeCount = 0;
      maybeFinish();
      broadcast();
      sendPrivate(socket, seat);
      return;
    }

    // normals と secret に分ける
    const sec = chosen[secretIndex];
    p.life = {
      normals: chosen.filter((_, i) => i !== secretIndex).map(x => x.concept),
      secret: { concept: sec.concept, _revealed: false }
    };
    p.lifeCount = chosen.length; // 1〜3

    if (!game.history.lifePicked.includes(seat)) {
      game.history.lifePicked.push(seat);
    }

    // 全員（生存者）が選び終えたら LIFE_REVEAL → BATTLE へ
    const allPicked = [1, 2, 3].every(s => {
      const ps = game.players[s];
      return (!ps.alive) || (ps.lifeCount > 0);
    });

    if (allPicked) {
      game.phase = Phase.LIFE_REVEAL;
      broadcast();
      // すぐバトルへ
      game.phase = Phase.BATTLE;
      game.round = 1;
    }

    broadcast();
    sendPrivate(socket, seat);
  });


  // 攻撃（同時入力）
  socket.on('submitAttack', (concept) => {
    if (game.phase !== Phase.BATTLE) return;
    const seat = findSeatBySocket(socket.id); if (!seat) return;
    const p = game.players[seat];
    if (!p.alive) { socket.emit('errorMsg', '脱落中'); return; }

    const t = String(concept || '').trim();
    if (!t) { socket.emit('errorMsg', '空は不可'); return; }
    if (p.attack) { socket.emit('errorMsg', 'このターンは提出済'); return; }

    p.attack = t;

    // 全員（生存者）が提出したら解決
    const alive = aliveSeats();
    const ready = alive.every(s => !!game.players[s].attack);
    if (ready) resolveTurn();

    broadcast();
  });

  socket.on('resetGame', () => { game = resetGame(); broadcast(); });

  socket.on('disconnect', () => {
    const seat = findSeatBySocket(socket.id);
    if (seat) {
      // シンプル：誰か抜けたらリセット
      game = resetGame();
      broadcast();
    }
  });

  // 初期送信
  broadcast();
  // 自分のプライベート
  const seat0 = findSeatBySocket(socket.id);
  if (seat0) sendPrivate(socket, seat0);
});

// 攻撃 × 全ライフに対して判定（10<=score<50で破壊）
async function resolveTurn() {
  const attacks = aliveSeats().map(seat => ({ seat, concept: game.players[seat].attack }));
  const destroys = [];
  const reveals = [];

  // 攻撃 × 全ライフを列挙
  const lifeTargets = [];
  for (const owner of [1, 2, 3]) {
    const target = game.players[owner];
    if (!target.alive) continue;
    for (const con of target.life.normals) lifeTargets.push({ owner, which: 'normal', concept: con });
    if (target.life.secret && !target.life.secret._destroyed) {
      lifeTargets.push({ owner, which: 'secret', concept: target.life.secret.concept });
    }
  }

  // LLMでまとめて採点
  const pairs = [];
  for (const atk of attacks) for (const lt of lifeTargets) pairs.push({ a: atk.concept, b: lt.concept });
  const scores = await scorePairsLLM(pairs);

  // 閾値判定（10 <= score < 50 で破壊）
  let k = 0;
  for (const atk of attacks) {
    for (const lt of lifeTargets) {
      const sc = scores[k++];
      if (sc >= 10 && sc < 50) {
        const target = game.players[lt.owner];
        if (lt.which === 'normal') {
          const idx = target.life.normals.indexOf(lt.concept);
          if (idx !== -1) {
            target.life.normals.splice(idx, 1);
            target.lifeCount--;
            destroys.push({ owner: lt.owner, which: 'normal', concept: lt.concept });
          }
        } else {
          if (target.life.secret && !target.life.secret._destroyed) {
            target.life.secret._destroyed = true;
            target.lifeCount--;
            destroys.push({ owner: lt.owner, which: 'secret', concept: lt.concept });
            target.life.secret._revealed = true; // 破壊と同時に公開
            reveals.push({ owner: lt.owner, concept: lt.concept });
          }
        }
      }
    }
  }

  // 脱落処理 & 攻撃クリア
  for (const s of [1, 2, 3]) {
    const p = game.players[s];
    if (p.alive && p.lifeCount <= 0) p.alive = false;
    p.attack = null;
  }

  // ログ
  game.history.turns.push({ round: game.round, attacks, destroys, reveals });

  // 勝敗 & 次ターン
  if (maybeFinish()) { broadcast(); return; }
  game.round += 1;
  broadcast();
}


function maybeFinish() {
  const alive = aliveSeats();
  if (alive.length <= 1) {
    game.phase = Phase.FINISHED;
    return true;
  }
  return false;
}

function findSeatBySocket(id) {
  return [1, 2, 3].find(s => game.players[s].socketId === id) || null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`http://localhost:${PORT}`));

// ペア配列 [{a:"攻撃or候補", b:"テーマorライフ"}...] を 0..100 で返す
async function scorePairsLLM(pairs) {
  if (!OPENAI_API_KEY || !pairs?.length) {
    // キーが無い時や空は即フォールバック
    return pairs.map(({ a, b }) => demoScore(a, b));
  }

  // キャッシュヒットは先に埋めて、残りだけ問い合わせる
  const results = new Array(pairs.length).fill(null);
  const ask = [];
  pairs.forEach(({ a, b }, idx) => {
    const key = normalize(a) + '|' + normalize(b);
    if (game.relCache.has(key)) {
      results[idx] = game.relCache.get(key);
    } else {
      ask.push({ idx, a, b, key });
    }
  });
  if (!ask.length) return results;

  const system = `あなたは概念間の無関係度を厳密に数値化する審判。
出力は必ずJSONのみ。
採点規則:
- 各ペアに 0〜100 の整数score。
- 0=極めて深い関連, 100=極めて浅い。
- 「不明・判断困難」は 45〜60 の中域を用い、安易に80〜100へ逃げない。
- 同義/極近: 0〜15、中距離: 40〜60、別領域: 75〜95 を目安。
- 短語でも、想定される文脈・分野の重なり（学術/文化/日常）を積極的に推定する。`;


  const user = `採点対象のペア配列:
${JSON.stringify(ask.map(x => ({ i: x.idx, a: x.a, b: x.b })), null, 2)}

出力フォーマット（厳守）:
{"pairs":[{"i":番号,"score":整数0-100}...]}`;

  try {
    const json = await callLLMJson({ system, user });
    const arr = Array.isArray(json.pairs) ? json.pairs : [];
    for (const item of arr) {
      if (typeof item?.i === 'number' && typeof item?.score === 'number') {
        const i = item.i;
        const v = Math.max(0, Math.min(100, Math.round(item.score)));
        results[i] = v;
        const { a, b } = pairs[i];
        const key = normalize(a) + '|' + normalize(b);
        game.relCache.set(key, v);
      }
    }
    // 欠損はフォールバック
    for (let i = 0; i < results.length; i++) {
      if (results[i] === null) {
        const { a, b } = pairs[i];
        const v = demoScore(a, b);
        results[i] = v;
        game.relCache.set(normalize(a) + '|' + normalize(b), v);
      }
    }
    return results;
  } catch (e) {
    // 失敗時は全フォールバック
    return pairs.map(({ a, b }) => {
      const v = demoScore(a, b);
      game.relCache.set(normalize(a) + '|' + normalize(b), v);
      return v;
    });
  }
}

function normalizeScoresForPick(table) {
  const all = table.flat();
  const min = Math.min(...all), max = Math.max(...all);
  // 極端な上寄りを抑える：min/maxで [15..85] に線形リマップ
  const lo = 15, hi = 85;
  const map = (v) => {
    if (max === min) return 50;
    const t = (v - min) / (max - min);
    return Math.round(lo + t * (hi - lo));
  };
  return table.map(([a, b]) => [map(a), map(b)]);
}
async function embeddingsFor(texts) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: texts })
  });
  const data = await res.json();
  return data.data.map(x => x.embedding);
}
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
async function scorePairsEmb(pairs) {
  if (!OPENAI_API_KEY || !pairs?.length) return pairs.map(({ a, b }) => demoScore(a, b));
  // まとめてユニーク
  const uniq = new Map();
  pairs.forEach(({ a, b }) => {
    const A = normalize(a), B = normalize(b);
    if (!uniq.has(A)) uniq.set(A, null);
    if (!uniq.has(B)) uniq.set(B, null);
  });
  const keys = [...uniq.keys()];
  const embs = await embeddingsFor(keys);
  keys.forEach((k, i) => uniq.set(k, embs[i]));
  const out = [];
  for (const { a, b } of pairs) {
    const va = uniq.get(normalize(a)), vb = uniq.get(normalize(b));
    const sim = cosine(va, vb);
    const score = Math.round(100 * (1 - sim)); // 0深い〜100浅い
    out.push(score);
  }
  return out;
}
