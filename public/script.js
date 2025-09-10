const socket = io();
const $ = id => document.getElementById(id);

// ---- 必須DOM ----
const nameEl = $('name'), joinBtn = $('join'), resetBtn = $('reset');
const phaseEl = $('phase'), themesEl = $('themes');
const p5Area = $('p5InputArea'), p5Text = $('p5'), submitP5 = $('submitP5');
const p5ScoreArea = $('p5ScoreArea'), p5table = $('p5table'), lifePick = $('lifePick'), pickBtn = $('pickBtn');
const playersEl = $('players'), atkEl = $('atk'), atkBtn = $('atkBtn'), logEl = $('log'), errEl = $('error');

// もしIDが欠けているとここで分かる
const requiredIds = { nameEl, joinBtn, resetBtn, phaseEl, themesEl, p5Area, p5Text, submitP5, p5ScoreArea, p5table, lifePick, pickBtn, playersEl, atkEl, atkBtn, logEl, errEl };
for (const [k, v] of Object.entries(requiredIds)) {
    if (!v) console.warn('[UI missing]', k);
}

let state = { phase: 'waiting', round: 0, themes: [], players: [], history: null, pickSumLimit: 150 };
let mine = { seat: null, privateInputs: [], privateScores: [], lifeMine: null };

// ---- イベント送信 ----
joinBtn.onclick = () => socket.emit('join', nameEl.value.trim());
resetBtn.onclick = () => socket.emit('resetGame');

// 5つ提出
submitP5.onclick = () => {
    const lines = p5Text.value.split('\n').map(s => s.trim()).filter(Boolean);
    if (lines.length !== 5) { flashErr('ちょうど5件入力してね'); return; }
    socket.emit('submitPrivateFive', lines);
};

// ライフ確定
pickBtn.onclick = () => {
    const checks = [...lifePick.querySelectorAll('input[type=checkbox]:checked')];
    if (checks.length < 1 || checks.length > 3) { flashErr('1〜3件チェックしてね'); return; }

    // チェックされた概念のインデックス配列
    const selected = checks.map(x => parseInt(x.value, 10));

    // シークレット（チェック済みの中から1つ）
    const sec = lifePick.querySelector('input[name="sec"]:checked');
    if (!sec) { flashErr('シークレットを1つ選んでね'); return; }
    // sec.value は「selected 内での位置（0..）」を使う
    const secretIndex = parseInt(sec.value, 10);
    if (isNaN(secretIndex) || secretIndex < 0 || secretIndex >= selected.length) {
        flashErr('シークレット指定が不正'); return;
    }
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

// ---- ソケット受信 ----
socket.on('state', (s) => {
    state = s || state;
    // デフォルト値保険
    if (typeof state.pickSumLimit !== 'number') state.pickSumLimit = 150;
    render();
    renderPrivate(); // ← フェーズ遷移直後でも私有UIを更新
});

socket.on('privateView', (v) => {
    mine = { ...mine, ...v };
    renderPrivate();
});

socket.on('errorMsg', (m) => flashErr(m));

// ---- 描画 ----
function render() {
    phaseEl.textContent = `Phase: ${state.phase} / Round: ${state.round}`;
    themesEl.textContent = state.themes?.length
        ? `テーマA：「${state.themes[0]}」　テーマB：「${state.themes[1]}」`
        : '—';

    // プレイヤー公開情報
    playersEl.innerHTML = '';
    (state.players || []).forEach(p => {
        const div = document.createElement('div');
        div.className = 'panel';
        div.innerHTML = `
      <strong>P${p.seat}：${p.name || '-'}</strong>　${p.alive ? '生存' : '脱落'}　ライフ：${p.lifeCount}<br/>
      公開ライフ：${(p.livesPublic || []).map(x => `「${x}」`).join(' / ') || '—'}<br/>
      シークレット公開：${p.secretRevealed ? `「${p.secretRevealed}」` : '未公開'}
    `;
        playersEl.appendChild(div);
    });

    // 入力可否切替
    const canP5 = state.phase === 'private5_input';
    const canPick = state.phase === 'life_pick';
    const canAtk = state.phase === 'battle';

    p5Area.style.display = canP5 ? '' : 'none';
    p5ScoreArea.style.display = (canPick || (mine?.privateScores?.length > 0)) ? '' : 'none';
    pickBtn.disabled = !canPick;

    atkEl.disabled = !canAtk; atkBtn.disabled = !canAtk;
    if (canAtk && atkEl.placeholder.includes('提出済')) atkEl.placeholder = '攻撃用概念を入力…';

    // ログ
    // ログ
    logEl.innerHTML = '';
    if (state.history) {
        state.history.turns.forEach(turn => {
            const wrap = document.createElement('div');
            wrap.className = 'panel';

            const a = (turn.attacks || []).map(x => `P${x.seat}「${x.concept}」`).join(' / ');
            const d = (turn.destroys || []).map(x => `[破壊] P${x.owner} ${x.which === 'secret' ? '(SECRET)' : ''}「${x.concept}」`).join('　');
            const r = (turn.reveals || []).map(x => `[公開] P${x.owner} SECRET→「${x.concept}」`).join('　');

            // ★ 関係度テーブル（details）
            let tableHtml = '';
            if (Array.isArray(turn.details) && turn.details.length) {
                const rows = turn.details.map(row => `
        <tr>
          <td>P${row.atkSeat}</td>
          <td>「${row.atkConcept}」</td>
          <td>P${row.targetOwner}</td>
          <td>${row.targetWhich === 'secret' ? 'SECRET' : 'NORMAL'}</td>
          <td>${row.targetConcept ? `「${row.targetConcept}」` : '—'}</td>
          <td style="text-align:right">${row.score}</td>
        </tr>
      `).join('');
                tableHtml = `
        <table class="matrix" style="margin-top:6px;min-width:480px">
          <tr>
            <th>攻撃者</th><th>攻撃概念</th><th>対象P</th><th>種別</th><th>ライフ概念</th><th>スコア</th>
          </tr>
          ${rows}
        </table>
      `;
            }

            wrap.innerHTML = `
      <strong>R${turn.round}</strong>
      <br/>攻撃：${a || '—'}
      <br/>${d || ''}<br/>${r || ''}
      ${tableHtml}
    `;
            logEl.appendChild(wrap);
        });
    }

}

function renderPrivate() {
    if (!mine) return;

    // 5×2表（自分だけに見える）
    if (mine.privateScores?.length) {
        p5ScoreArea.style.display = '';
        const rows = mine.privateInputs.map((c, i) => {
            const sc = mine.privateScores[i] || ['-', '-'];
            const sum = (Number(sc[0]) || 0) + (Number(sc[1]) || 0);
            return `<tr><th>${i}</th><td>「${c.concept}」</td><td>${sc[0]}</td><td>${sc[1]}</td><td>${sum}</td></tr>`;
        }).join('');
        p5table.innerHTML = `
      <tr><th>#</th><th>概念</th><th>テーマA</th><th>テーマB</th><th>合計</th></tr>
      ${rows}
    `;

        // ライフ選抜UI（合計 <= state.pickSumLimit）
        const limit = state.pickSumLimit ?? 150;
        const limitTextEl = document.getElementById('limitText');
        if (limitTextEl) limitTextEl.textContent = String(limit);
        lifePick.innerHTML = mine.privateInputs.map((c, i) => {
            const sc = mine.privateScores[i] || [999, 999];
            const sum = (Number(sc[0]) || 0) + (Number(sc[1]) || 0);
            const ok = sum <= limit;
            return `
        <div style="margin:6px 0">
          <label>
            <input type="checkbox" class="lifeChk" value="${i}" ${ok ? '' : 'disabled'} />
            #${i} 「${c.concept}」 （合計:${sum}${ok ? ` ≤${limit} ✅` : ` >${limit} ❌`}）
          </label>
          &nbsp; / SECRET:
          <input type="radio" name="sec" class="secRadio" data-idx="${i}" disabled>
        </div>
      `;
        }).join('');

        // チェックの変化に応じて「チェックされたものの中から」シークレット候補を有効化
        const syncSecretRadios = () => {
            const selectedIdxs = [...lifePick.querySelectorAll('.lifeChk:checked')].map(x => +x.value);
            const radios = [...lifePick.querySelectorAll('.secRadio')];
            radios.forEach(r => {
                const idx = +r.dataset.idx;
                const pos = selectedIdxs.indexOf(idx);
                if (pos >= 0) {
                    r.disabled = false;
                    // ラジオの value は「selected 内での位置（0..）」を入れる
                    r.value = String(pos);
                } else {
                    r.disabled = true;
                    r.checked = false;
                    r.value = '';
                }
            });
        };

        lifePick.onchange = syncSecretRadios;
        // 初期呼び出し（もし既にチェックがあるなら）
        syncSecretRadios();
    }
}

function flashErr(m) {
    if (!errEl) { alert(m); return; }
    errEl.textContent = m;
    setTimeout(() => errEl.textContent = '', 1800);
}
