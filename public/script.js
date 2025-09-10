const socket = io();
const $ = id => document.getElementById(id);

const nameInput = $('name');
const joinBtn = $('join');
const resetBtn = $('reset');
const statusEl = $('status');
const conceptInput = $('concept');
const submitBtn = $('submit');
const seatsEl = $('seats');
const historyEl = $('history');

let state = {
    seats: [],
    phase: 'waiting',
    round: 0,
    maxRounds: 2,
    submittedSeats: [],
    history: []
};

joinBtn.onclick = () => socket.emit('join', nameInput.value.trim());
resetBtn.onclick = () => socket.emit('resetGame');

submitBtn.onclick = () => {
    const t = conceptInput.value.trim();
    if (!t) return;
    socket.emit('submitConcept', t);
    conceptInput.value = '';
    conceptInput.placeholder = '提出済…公開を待機';
    conceptInput.disabled = true;
    submitBtn.disabled = true;
};

socket.on('state', (s) => {
    state = s;
    render();
});

socket.on('errorMsg', (msg) => {
    statusEl.textContent = msg;
    statusEl.style.color = '#ffb4b4';
    setTimeout(() => { statusEl.textContent = ''; statusEl.style.color = '#9aa3ab'; }, 1800);
});

function render() {
    // ステータス
    if (state.phase === 'waiting') {
        statusEl.textContent = '待機中：3人が入室するとラウンド1開始である．';
    } else if (state.phase === 'playing') {
        statusEl.textContent = `進行中：ラウンド ${state.round}/${state.maxRounds} である．`;
    } else {
        statusEl.textContent = '終了：全ラウンド公開済みである．';
    }
    statusEl.style.color = '#9aa3ab';

    // 座席状態（本文は公開しない）
    seatsEl.innerHTML = '';
    for (let i = 1; i <= 3; i++) {
        const seat = state.seats.find(x => x.seat === i);
        const li = document.createElement('li');
        const submitted = state.submittedSeats.includes(i);
        li.textContent = seat
            ? `P${i}：${seat.name}　${submitted ? '（提出済）' : '（未提出）'}`
            : `P${i}：（空席）`;
        seatsEl.appendChild(li);
    }

    // 入力可否
    const canSubmit = (state.phase === 'playing');
    conceptInput.disabled = !canSubmit;
    submitBtn.disabled = !canSubmit;
    if (canSubmit && conceptInput.placeholder.includes('提出済')) {
        conceptInput.placeholder = 'このラウンドの概念を入力…';
    }

    // 履歴（同時公開済のみ）
    historyEl.innerHTML = '';
    state.history.forEach(block => {
        const wrap = document.createElement('div');
        wrap.className = 'panel';
        const h = document.createElement('h3');
        h.textContent = `ラウンド ${block.round}（同時公開）`;
        wrap.appendChild(h);

        const ul = document.createElement('ul');
        block.concepts.forEach(c => {
            const li = document.createElement('li');
            const seat = state.seats.find(x => x.seat === c.seat);
            li.textContent = `P${c.seat}：${seat ? seat.name : `P${c.seat}`}「${c.text}」`;
            ul.appendChild(li);
        });
        wrap.appendChild(ul);

        // スコア行列（0=深い,100=浅い）
        const tbl = document.createElement('table');
        tbl.className = 'matrix';
        const names = block.concepts.map(c => `P${c.seat}`);
        const head = document.createElement('tr');
        head.innerHTML = '<th></th>' + names.map(n => `<th>${n}</th>`).join('');
        tbl.appendChild(head);
        for (let i = 0; i < block.concepts.length; i++) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<th>${names[i]}</th>` +
                block.scores[i].map((v, j) => i === j ? '<td>—</td>' :
                    `<td class="${v >= 70 ? 'bad' : (v <= 20 ? 'good' : '')}">${v}</td>`).join('');
            tbl.appendChild(tr);
        }
        wrap.appendChild(tbl);

        historyEl.appendChild(wrap);
    });
}
