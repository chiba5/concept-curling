const socket = io();
const $ = id => document.getElementById(id);

const nameEl = $('name'), joinBtn = $('join'), resetBtn = $('reset');
const phaseEl = $('phase'), themesEl = $('themes');
const p5Area = $('p5InputArea'), p5Text = $('p5'), submitP5 = $('submitP5');
const p5ScoreArea = $('p5ScoreArea'), p5table = $('p5table'), lifePick = $('lifePick'), pickBtn = $('pickBtn');
const playersEl = $('players'), atkEl = $('atk'), atkBtn = $('atkBtn'), logEl = $('log'), errEl = $('error');

let state = { phase: 'waiting', round: 0, themes: [], players: [], history: null };
let mine = { seat: null, privateInputs: [], privateScores: [], lifeMine: null };

const HIT_MIN = 10, HIT_MAX = 50; // サーバと合わせる

function scoreClass(score) {
    if (score < HIT_MIN) return 'score-close';
    if (score >= HIT_MIN && score < HIT_MAX) return 'score-hit';
    return 'score-safe';
}

joinBtn.onclick = () => socket.emit('join', nameEl.value.trim());
resetBtn.onclick = () => socket.emit('resetGame');

// 5つ提出
submitP5.onclick = () => {
    const lines = p5Text.value.split('\n').map(s => s.trim()).filter(Boolean);
    if (lines.length !== 5) { flashErr('ちょうど5件入力してね'); return; }
    socket.emit('submitPrivateFive', lines);
};

// 攻撃×ライフのピボット表を作る
function buildTurnMatrix(turn) {
    if (!Array.isArray(turn.details) || !turn.details.length) return '';

    // 列（ライフ）の抽出：ownerごとに NORMAL → SECRET の順
    const cols = [];
    const colKey = (r) =>
        r.targetWhich === 'secret' ? `S|${r.targetOwner}` : `N|${r.targetOwner}|${r.targetConcept}`;
    const colLabel = (r) => {
        if (r.targetWhich === 'secret') {
            // 未公開は「P◯ SECRET」、公開済みなら概念名を見せる
            return (r.targetConcept && r.targetConcept !== 'SECRET')
                ? `P${r.targetOwner} ${r.targetConcept}`
                : `P${r.targetOwner} SECRET`;
        }
        return `P${r.targetOwner} ${r.targetConcept}`;
    };
    turn.details.forEach(r => {
        const key = colKey(r);
        if (!cols.find(c => c.key === key)) {
            cols.push({ key, label: colLabel(r), owner: r.targetOwner, which: r.targetWhich });
        }
    });
    // 並びを P1→P2→P3、NORMAL→SECRET に整える
    cols.sort((a, b) => (a.owner - b.owner) || (a.which === 'secret') - (b.which === 'secret'));

    // 行（攻撃）の抽出：座席→入力順で安定化
    const rows = [];
    const rowKey = (r) => `A|${r.atkSeat}|${r.atkConcept}`;
    turn.details.forEach(r => {
        const key = rowKey(r);
        if (!rows.find(x => x.key === key)) {
            rows.push({ key, atkSeat: r.atkSeat, atkConcept: r.atkConcept });
        }
    });
    rows.sort((a, b) => (a.atkSeat - b.atkSeat) || a.atkConcept.localeCompare(b.atkConcept, 'ja'));

    // 値マップ
    const cell = new Map();
    turn.details.forEach(r => {
        cell.set(rowKey(r) + '|' + colKey(r), r.score);
    });

    // HTML
    const thead = `<tr>
    <th>攻撃者</th><th>攻撃概念</th>
    ${cols.map(c => `<th>${c.label}</th>`).join('')}
  </tr>`;

    const tbody = rows.map(row => {
        const cells = cols.map(c => {
            const v = cell.get(row.key + '|' + c.key);
            const text = (v == null) ? '—' : v;
            const cls = (v == null) ? '' : scoreClass(Number(v));
            return `<td class="num ${cls}">${text}</td>`;
        }).join('');
        return `<tr>
      <td>P${row.atkSeat}</td>
      <td>「${row.atkConcept}」</td>
      ${cells}
    </tr>`;
    }).join('');

    return `<table class="matrix" style="margin-top:6px">${thead}${tbody}</table>`;
}


// ライフ確定
pickBtn.onclick = () => {
    const checks = [...lifePick.querySelectorAll('input[type=checkbox]:checked')];
    if (checks.length < 1 || checks.length > 3) { flashErr('1〜3件チェックしてね'); return; }
    const radios = [...lifePick.querySelectorAll('input[type=radio]:checked')];
    if (radios.length !== 1) { flashErr('シークレットを1つ選んでね'); return; }

    const selected = checks.map(x => parseInt(x.value, 10));
    const secretIndex = parseInt(radios[0].value, 10);
    socket.emit('pickLives', { selected, secretIndex });
};

// 攻撃
atkBtn.onclick = () => {
    const t = atkEl.value.trim();
    if (!t) { flashErr('攻撃概念が空'); return; }
    socket.emit('submitAttack', t);
    atkEl.value = '';
    atkEl.placeholder = '提出済…他プレイヤー待ち';
    atkEl.disabled = true; atkBtn.disabled = true;
};

socket.on('state', (s) => {
    state = s;
    render();
});

socket.on('privateView', (v) => {
    mine = { ...mine, ...v };
    renderPrivate();
});

socket.on('errorMsg', (m) => flashErr(m));

// --- render ---
function render() {
    phaseEl.textContent = `Phase: ${state.phase} / Round: ${state.round}`;
    themesEl.textContent = state.themes?.length ? `テーマA：「${state.themes[0]}」　テーマB：「${state.themes[1]}」` : '—';

    // プレイヤー公開情報
    playersEl.innerHTML = '';
    (state.players || []).forEach(p => {
        const el = document.createElement('div');
        el.className = 'playerCard';
        const badge = p.alive ? '<span class="badge green">生存</span>' : '<span class="badge red">脱落</span>';
        const secret = p.secretRevealed ? `「${p.secretRevealed}」` : '未公開';
        el.innerHTML = `
      <div class="playerHeader">
        <div><strong>P${p.seat}</strong>：${p.name || '-'}</div>
        <div>${badge}</div>
      </div>
      <div style="margin-top:6px">ライフ：<span class="badge gray">${p.lifeCount}</span></div>
      <div class="livesChips">
        ${(p.livesPublic || []).map(x => `<span class="chip">${x}</span>`).join('') || '<span class="chip">—</span>'}
      </div>
      <div style="margin-top:6px">シークレット：<span class="badge yellow">${secret}</span></div>
    `;
        playersEl.appendChild(el);
    });

    // 入力可能UIの切替
    const canP5 = state.phase === 'private5_input';
    p5Area.style.display = canP5 ? '' : 'none';

    const canPick = state.phase === 'life_pick';
    p5ScoreArea.style.display = (canPick || (mine.privateScores?.length > 0)) ? '' : 'none';
    pickBtn.disabled = !canPick;

    const canAtk = state.phase === 'battle';
    atkEl.disabled = !canAtk; atkBtn.disabled = !canAtk;
    if (canAtk && atkEl.placeholder.includes('提出済')) atkEl.placeholder = '攻撃用概念を入力…';

    // ログ
    logEl.innerHTML = '';
    if (state.history?.turns?.length) {
        // 新しいラウンドを上に表示
        state.history.turns.slice().reverse().forEach(turn => {
            const wrap = document.createElement('div'); wrap.className = 'panel';

            const a = (turn.attacks || []).map(x => `P${x.seat}「${x.concept}」`).join(' / ');
            const d = (turn.destroys || []).map(x => `[破壊] P${x.owner} ${x.which === 'secret' ? '(SECRET)' : ''}「${x.concept}」`).join('　');
            const r = (turn.reveals || []).map(x => `[公開] P${x.owner} SECRET→「${x.concept}」`).join('　');

            // ★ ピボット表（縦=攻撃、横=ライフ、セル=スコア）
            const matrix = buildTurnMatrix(turn);

            // 折りたたみ可能に（任意）
            const detailsId = `mtx-${turn.round}-${Math.random().toString(36).slice(2, 7)}`;
            wrap.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center;">
        <div><strong>R${turn.round}</strong></div>
        <div><button class="btn" data-toggle="${detailsId}">表を表示/非表示</button></div>
      </div>
      <div style="margin-top:6px">攻撃：${a || '—'}</div>
      <div>${d || ''}</div>
      <div>${r || ''}</div>
      <div id="${detailsId}" style="display:none">${matrix}</div>
    `;
            logEl.appendChild(wrap);
        });

        // toggle
        logEl.querySelectorAll('[data-toggle]').forEach(btn => {
            btn.onclick = () => {
                const id = btn.getAttribute('data-toggle');
                const box = document.getElementById(id);
                if (box) box.style.display = (box.style.display === 'none' ? 'block' : 'none');
            };
        });
    }

}

function renderPrivate() {
    // 5×2表
    if (mine.privateScores?.length) {
        p5ScoreArea.style.display = '';
        const rows = mine.privateInputs.map((c, i) => {
            const sc = mine.privateScores[i] || ['-', '-'];
            return `<tr><th>${i}</th><td>「${c.concept}」</td><td>${sc[0]}</td><td>${sc[1]}</td><td>${(sc[0] + sc[1])}</td></tr>`;
        }).join('');
        p5table.innerHTML = `
      <tr><th>#</th><th>概念</th><th>テーマA</th><th>テーマB</th><th>合計</th></tr>
      ${rows}
    `;

        // ライフ選抜UI
        const picks = mine.privateInputs.map((c, i) => {
            const sc = mine.privateScores[i]; const sum = (sc[0] + sc[1]);
            const ok = sum <= 150;
            return `
        <div style="margin:6px 0">
          <label>
            <input type="checkbox" value="${i}" ${ok ? '' : 'disabled'} />
            #${i} 「${c.concept}」 （合計:${sum}${ok ? ' ≤150 ✅' : ' >150 ❌'}）
          </label>
          &nbsp; / SECRET:
          <label><input type="radio" name="sec" value="${i}" disabled></label>
        </div>
      `;
        }).join('');
        lifePick.innerHTML = picks;

        // SECRETラジオ活性化
        lifePick.addEventListener('change', () => {
            const checked = [...lifePick.querySelectorAll('input[type=checkbox]:checked')].map(x => +x.value);
            const radios = lifePick.querySelectorAll('input[type=radio]');
            radios.forEach(r => r.disabled = true);
            checked.forEach(idx => {
                const r = lifePick.querySelector(`input[type=radio][value="${idx}"]`);
                if (r) r.disabled = false;
            });
        });
    }
}

function flashErr(m) {
    errEl.textContent = m;
    setTimeout(() => errEl.textContent = '', 1800);
}
