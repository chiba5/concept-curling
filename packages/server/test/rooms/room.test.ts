import { describe, expect, it } from 'vitest';
import { DemoScorer } from '../../src/scoring/demo.js';
import { Room } from '../../src/rooms/room.js';
import { DET_CONFIG, NO_DELAY, collect, until } from './helpers.js';

const makeRoom = () => {
  const c = collect();
  const room = new Room('ROOM01', DET_CONFIG, new DemoScorer(), c.cb, NO_DELAY);
  return { c, room };
};

describe('Room 参加と開始', () => {
  it('join は席とトークンを払い出し、満席で theming→(manual)submitting へ自動進行する', async () => {
    const { c, room } = makeRoom();
    const j1 = await room.join('アリス');
    expect(j1.ok).toBe(true);
    if (j1.ok) {
      expect(j1.value.seat).toBe(1);
      expect(j1.value.token).toMatch(/[0-9a-f-]{36}/);
      expect(j1.value.rejoined).toBe(false);
    }
    const j2 = await room.join('ボブ');
    expect(j2.ok).toBe(true);
    await until(() => c.last()?.phase === 'submitting');
    expect(c.last()?.themes).toEqual(['星座', '航海']);
  });
  it('満席後の join は room_full', async () => {
    const { room } = makeRoom();
    await room.join('A');
    await room.join('B');
    const r = await room.join('C');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('room_full');
  });
  it('addCpu / fillAndStart はホストのみ', async () => {
    const { room } = makeRoom();
    await room.join('A');
    const r1 = await room.addCpu(2);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe('not_host');
    const r2 = await room.fillAndStart(2);
    expect(r2.ok).toBe(false);
    const r3 = await room.addCpu(1);
    expect(r3.ok).toBe(true);
    expect(room.state.seats[1]?.controller).toBe('cpu');
  });
  it('seatOf はトークンから席を引ける', async () => {
    const { room } = makeRoom();
    const j = await room.join('A');
    if (j.ok) expect(room.seatOf(j.value.token)).toBe(1);
    expect(room.seatOf('unknown')).toBeUndefined();
  });
});

describe('Room reset', () => {
  it('ホストの reset で waiting に戻り、全席残存なら即再戦が始まる', async () => {
    const { c, room } = makeRoom();
    await room.join('A');
    await room.join('B');
    await until(() => c.last()?.phase === 'submitting');
    const r = await room.reset(1);
    expect(r.ok).toBe(true);
    // 全席残っているので即 theming→submitting（再戦）
    await until(() => c.last()?.phase === 'submitting');
    expect(room.state.turns).toEqual([]);
  });
  it('ホスト以外の reset は not_host', async () => {
    const { room } = makeRoom();
    await room.join('A');
    await room.join('B');
    const r = await room.reset(2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_host');
  });
});

describe('Room フルゲーム（決定的）', () => {
  it('2人: 提出→採点→選抜→攻撃→決着まで通り、判定録に理由が入る', async () => {
    const { c, room } = makeRoom();
    await room.join('アリス');
    await room.join('ボブ');
    await until(() => c.last()?.phase === 'submitting');

    const r1 = await room.submitConcepts(1, ['灯台', '羊皮紙', '簿記']);
    expect(r1.ok).toBe(true);
    const r2 = await room.submitConcepts(2, ['水平線', '風見鶏', '塩田']);
    expect(r2.ok).toBe(true);
    await until(() => c.last()?.phase === 'picking');

    // DemoScorer: 無関係語 × テーマ = 100 → total 200 <= 200 で全候補 pickable
    expect(c.priv.get(1)?.candidates.every((x) => x.pickable)).toBe(true);
    expect(c.priv.get(1)?.candidates[0]?.reasons[0]).toBe('簡易採点');

    await room.pickLives(1, [0], 0); // アリスの SECRET = 灯台
    await room.pickLives(2, [1], 1); // ボブの SECRET = 風見鶏
    await until(() => c.last()?.phase === 'battle');

    const a1 = await room.attack(1, '風見鶏'); // ボブの SECRET と完全一致 → score 0 → 破壊
    expect(a1.ok).toBe(true);
    const a2 = await room.attack(2, '油彩'); // 全ペア無関係 → 100 → 帯外
    expect(a2.ok).toBe(true);
    await until(() => c.last()?.phase === 'finished');

    const last = c.last();
    expect(last?.winnerSeat).toBe(1);
    expect(last?.players[1]?.secretRevealed).toBe('風見鶏');
    expect(last?.turns).toHaveLength(1);
    expect(last?.turns[0]?.details.every((d) => d.reason === '簡易採点')).toBe(true);
  });

  it('提出フェーズ外の submitConcepts / 二重攻撃はエラー ack になる', async () => {
    const { c, room } = makeRoom();
    await room.join('A');
    const early = await room.submitConcepts(1, ['a', 'b', 'c']);
    expect(early.ok).toBe(false);
    await room.join('B');
    await until(() => c.last()?.phase === 'submitting');
    await room.submitConcepts(1, ['灯台', '羊皮紙', '簿記']);
    const dup = await room.submitConcepts(1, ['灯台', '羊皮紙', '簿記']);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe('already_submitted');
  });

  it('reset はバトル中の解決フローと衝突しても壊れない（解決結果は安全に破棄）', async () => {
    const { c, room } = makeRoom();
    await room.join('A');
    await room.join('B');
    await until(() => c.last()?.phase === 'submitting');
    await room.submitConcepts(1, ['灯台', '羊皮紙', '簿記']);
    await room.submitConcepts(2, ['水平線', '風見鶏', '塩田']);
    await until(() => c.last()?.phase === 'picking');
    await room.pickLives(1, [0], 0);
    await room.pickLives(2, [0], 0);
    await until(() => c.last()?.phase === 'battle');
    await room.attack(1, '水平線');
    await room.attack(2, '油彩'); // readyToResolve → 解決フロー起動
    await room.reset(1); // 解決の採点中に割込み
    await until(() => c.last()?.phase === 'submitting'); // 即再戦
    // 破棄された解決結果が state を汚していない（turns は空のまま新ゲーム）
    expect(room.state.turns).toEqual([]);
  });
});
