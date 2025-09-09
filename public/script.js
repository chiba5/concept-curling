/* ===========================================================
   関連度バトル（LLM採点／サーバ経由・APIキー非公開） Frontend
   =========================================================== */

const state = {
    players: [1, 2, 3],
    maxTurnsPerPlayer: 2,
    concepts: [], // { text, player, round }
    // scores: Map<"i-j", { score_raw:number, reason:string }>
    scores: new Map(),
};

const colors = { 1: 'p1', 2: 'p2', 3: 'p3' };
const $ = (id) => document.getElementById(id);

const submitBtn = $('submitBtn');
const undoBtn = $('undoBtn');
const resetBtn = $('resetBtn');
const turnInfo = $('turnInfo');
const conceptList = $('conceptList');
const matrixTable = $('matrix');
const scoreBoard = $('scoreBoard');
const winnerBox = $('winner');
const llmStatus = $('llmStatus');
const conceptInput = $('conceptInput');
const autoAdvance = $('autoAdvance');

/* ========== ゲーム進行 ========== */
function currentRound() { return state.concepts.length; } // 0..6
function currentPlayer() { return state.players[currentRound() % state.players.length]; }
function isGameOver() { return state.concepts.length >= state.players.length * state.maxTurnsPerPlayer; }
function labelOf(it) { return `<span class="pill ${colors[it.player]}">P${it.player}</span> ${escapeHtml(it.text)}`; }
function pairKey(i, j) { return i < j ? `${i}-${j}` : `${j}-${i}`; }

function renderTurn() {
    if (isGameOver()) {
        turnInfo.textContent = 'ゲーム終了：全6手完了';
        submitBtn.disabled = true; conceptInput.disabled = true;
    } else {
        const p = currentPlayer();
        const hand = currentRound() + 1;
        turnInfo.textContent = `第${hand}手：プレイヤー${p}のターン`;
        submitBtn.disabled = false; conceptInput.disabled = false;
    }
}

function renderConcepts() {
    conceptList.innerHTML = '';
    state.concepts.forEach(c => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="pill ${colors[c.player]}">P${c.player}</span> <strong>${escapeHtml(c.text)}</strong>`;
        conceptList.appendChild(li);
    });
}

/* ========== LLM採点関連 ========== */
function enumeratePairs(n) {
    const pairs = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
    return pairs;
}
function pendingPairs() {
    const n = state.concepts.length;
    const ps = enumeratePairs(n);
    return ps.filter(([i, j]) => !state.scores.has(pairKey(i, j)));
}

/* ---- プロンプト構築（中心帯＆5刻み回避・小数raw） ---- */
function buildPrompt(concepts, pairs) {
    const list = concepts.map((c, i) => `[${i}] ${c.text}`).join('\n');
    const ask = pairs.map(([i, j]) => ({ a: i, b: j, term_a: concepts[i].text, term_b: concepts[j].text }));

    const system = `あなたは概念ペアの関連度を0〜100で厳密に採点する審判である。
出力は必ずJSONのみ。日本語で考え、日本語の"reason"を簡潔に述べる。

採点規則（重要）:
- "score_raw" は 0〜100 の実数（小数第1位まで）。"score" は score_raw を四捨五入した整数。
- 0 は極めて深い関連、100 は極めて浅い関連（無関係）。
- 同義/同分野は 0〜15、緩い連想は 16〜40、遠いが接点ありは 41〜70、ほぼ無関係は 71〜95、断絶は 96〜100 を目安とする。
- 中央帯(45〜55)の多用は避ける。38〜44 / 56〜62 など曖昧帯への逃避も避ける。
- 5の倍数（50, 55, 60 など）への丸め込みを避ける。score_raw は 5の倍数にならない数を原則として選ぶ。
- 表層の文字一致に依存せず、意味領域・使用文脈・学術領域・時代性・文化圏を総合して判断する。
- 本ゲームは関係性の「低さ」を競う。曖昧時はやや厳しめ（＝大きめの score_raw）でよい。

出力フォーマット（厳守）:
{"pairs":[{"a":番号,"b":番号,"score_raw":実数(小数1桁),"score":整数0-100,"reason":"短い説明"}]}`;

    const user = `対象概念：
${list}

採点対象ペア（配列）：
${JSON.stringify(ask, null, 2)}

出力フォーマット（厳守）：
{"pairs":[{"a":番号,"b":番号,"score_raw":実数(小数1桁),"score":整数0-100,"reason":"短い説明"}]}`;

    const pe = $('promptExample'); if (pe) pe.textContent = system + '\n\n' + user;
    return { system, user };
}

/* ---- サーバへPOST（/score） ----
   期待する返り値：LLMが生成したJSON（文字列 or オブジェクト）
   例：
   {"pairs":[{"a":0,"b":1,"score_raw":72.3,"score":72,"reason":"..."}]}
------------------------------------------------------- */
async function callServerScore(concepts, pairs) {
    if (!pairs.length) return;
    const { system, user } = buildPrompt(concepts, pairs);
    llmStatus.textContent = '採点中…';

    try {
        const res = await fetch('/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ system, user })
        });
        if (!res.ok) {
            const t = await res.text();
            throw new Error(`HTTP ${res.status} ${t}`);
        }
        let data = await res.json();
        // サーバが文字列で返す場合に備えてパース
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch { /* noop */ }
        }

        const arr = (data && data.pairs) ? data.pairs : [];
        for (const p of arr) {
            const keyp = pairKey(p.a, p.b);
            let raw = toNumber(p.score_raw);
            if (!Number.isFinite(raw)) raw = toNumber(p.score);
            if (!Number.isFinite(raw)) continue;

            // 5の倍数回避（保険）：もし整数化で5の倍数に寄るなら微小ノイズ付与
            if (Math.round(raw) % 5 === 0) {
                raw += ((hash(`${p.a}-${p.b}`) % 2) ? +0.3 : -0.3);
            }
            state.scores.set(keyp, { score_raw: raw, reason: p.reason || '' });
        }
        llmStatus.textContent = '採点完了';
    } catch (err) {
        console.error(err);
        llmStatus.textContent = '採点失敗：サーバまたはモデルに接続できない';
    }
}

function toNumber(x) { const n = Number(x); return Number.isFinite(n) ? n : NaN; }

/* ========== スコア→表示用整数スコア変換（密集緩和） ========== */
function hash(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

// 中心50から1.25倍ストレッチ＋微小ディザ（±0.45）
function toIntScore(raw) {
    const stretched = 50 + (raw - 50) * 1.25;
    const dither = ((hash(raw.toString()) % 7) - 3) * 0.15;
    const v = Math.max(0, Math.min(100, Math.round(stretched + dither)));
    return v;
}

/* ========== 行列構築 & 勝敗判定 ========== */
function buildDistanceMatrix(items) {
    const n = items.length;
    const M = Array.from({ length: n }, () => Array(n).fill(null));
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const key = pairKey(i, j);
            const raw = state.scores.get(key)?.score_raw;
            if (typeof raw === 'number') {
                const v = toIntScore(raw);
                M[i][j] = M[j][i] = v;
            }
        }
    }
    return M;
}

/* 代表値 = 他概念とのスコアの最小値（最も深い関連） */
function computeScores(items, M) {
    const perConcept = items.map((it, i) => {
        let bestVal = null, bestJ = null;
        for (let j = 0; j < M.length; j++) {
            if (i === j) continue;
            const v = M[i][j];
            if (typeof v === 'number') {
                if (bestVal === null || v < bestVal) {
                    bestVal = v; bestJ = j;
                }
            }
        }
        return { index: i, player: it.player, text: it.text, minDist: bestVal, nearestIndex: bestJ };
    });

    // 勝者：代表値（最小スコア）の「最大値」を出した概念
    const valid = perConcept.filter(x => x.minDist !== null);
    let best = [];
    if (valid.length) {
        const maxOfMins = Math.max(...valid.map(x => x.minDist));
        best = valid.filter(x => x.minDist === maxOfMins);
    }
    return { perConcept, best };
}

/* ========== 表示 ========== */
function renderMatrix() {
    const items = state.concepts;
    const n = items.length;
    const M = buildDistanceMatrix(items);

    // ヘッダ（右端に代表値）
    const head = [''].concat(items.map((it) => labelOf(it))).concat(['代表値（最小）']);
    let html = '<tr>' + head.map(h => `<th>${h}</th>`).join('') + '</tr>';

    const { perConcept, best } = computeScores(items, M);
    const bestSet = new Set(best.map(b => b.index));

    for (let i = 0; i < n; i++) {
        const rowCells = [`<th>${labelOf(items[i])}</th>`];
        for (let j = 0; j < n; j++) {
            if (i === j) { rowCells.push('<td>—</td>'); continue; }
            const v = M[i][j];
            const cls = typeof v === 'number' ? (v >= 70 ? 'bad' : (v <= 20 ? 'good' : '')) : '';
            rowCells.push(`<td class="${cls}">${typeof v === 'number' ? v : '…'}</td>`);
        }
        const rep = perConcept[i]?.minDist;
        const repCls = typeof rep === 'number' ? (rep >= 70 ? 'bad' : (rep <= 20 ? 'good' : '')) : '';
        rowCells.push(`<td class="${repCls}"><strong>${rep ?? '—'}</strong></td>`);
        const trClass = bestSet.has(i) ? ' style="outline:2px solid #fcd34d;"' : '';
        html += `<tr${trClass}>${rowCells.join('')}</tr>`;
    }
    matrixTable.innerHTML = html;

    renderScores(perConcept, best);
}

function renderScores(perConcept, best) {
    scoreBoard.innerHTML = '';
    perConcept.forEach(x => {
        const card = document.createElement('div'); card.className = 'score-card';
        const who = document.createElement('div'); who.className = 'who';
        who.innerHTML = `<span class="pill ${colors[x.player]}">P${x.player}</span> <strong>${escapeHtml(x.text)}</strong>`;
        const sc = document.createElement('div'); sc.className = 'score';
        if (x.minDist === null) {
            sc.textContent = '代表値：—';
        } else {
            const partner = (x.nearestIndex != null)
                ? `（相手：${escapeHtml(state.concepts[x.nearestIndex].text)}）`
                : '';
            sc.textContent = `代表値（最も深い関連のスコア＝最小）：${x.minDist} ${partner}`;
        }
        card.append(who, sc);
        scoreBoard.appendChild(card);
    });

    if (best && best.length) {
        const names = best.map(b => `P${b.player}：「${escapeHtml(b.text)}」`).join('，');
        winnerBox.textContent = isGameOver()
            ? `勝者：${names}（ゲーム終了）`
            : `現在トップ：${names}`;
    } else {
        winnerBox.textContent = '判定には少なくとも2つ以上の概念が必要である．';
    }
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
}

/* ========== 入出力イベント ========== */
submitBtn.addEventListener('click', async () => {
    const text = conceptInput.value.trim();
    if (!text || isGameOver()) return;
    state.concepts.push({ text, player: currentPlayer(), round: currentRound() + 1 });
    if (autoAdvance && autoAdvance.checked) conceptInput.value = '';

    renderConcepts(); renderTurn();

    // 未採点ペアのみサーバへ
    const pairs = pendingPairs();
    await callServerScore(state.concepts, pairs);
    renderMatrix();
});

undoBtn.addEventListener('click', () => {
    if (!state.concepts.length) return;
    const removedIndex = state.concepts.length - 1;
    state.concepts.pop();
    // 当該インデックスとのスコアを削除
    for (let i = 0; i <= removedIndex; i++) {
        state.scores.delete(pairKey(i, removedIndex));
    }
    renderConcepts(); renderMatrix(); renderTurn();
});

resetBtn.addEventListener('click', () => {
    state.concepts = [];
    state.scores.clear();
    conceptInput.value = '';
    renderConcepts(); renderMatrix(); renderTurn();
});

/* 初期描画 */
renderTurn(); renderConcepts(); renderMatrix();
