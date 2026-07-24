import { describe, expect, it } from 'vitest';
import { Room } from '../../src/rooms/room.js';
import { DemoScorer } from '../../src/scoring/demo.js';
import { DET_CONFIG, NO_DELAY, collect, until } from './helpers.js';

describe('CPU 自動対局', () => {
  it('人間 1 + CPU 2 の 3 人戦が自動で決着まで進む', async () => {
    const config = { ...DET_CONFIG, playerCount: 3 };
    const c = collect();
    const room = new Room('R', config, new DemoScorer(), c.cb, NO_DELAY);
    await room.join('人間');
    const started = await room.fillAndStart(1);
    expect(started.ok).toBe(true);
    expect(room.state.seats.filter((s) => s.controller === 'cpu')).toHaveLength(2);

    await until(() => c.last()?.phase === 'submitting');
    await room.submitConcepts(1, ['灯台', '羊皮紙', '簿記']);
    // CPU 2 体が自動提出 → 全員採点完了 → picking
    await until(() => c.last()?.phase === 'picking', 5000);
    await room.pickLives(1, [0], [0]);
    await until(() => c.last()?.phase === 'battle', 5000);

    // サーバ側テストなので CPU のライフを直接読み、完全一致攻撃（score 85、destroyThreshold 50 超）で確実に破壊する
    for (let i = 0; i < 10 && room.state.phase === 'battle'; i++) {
      const target = room.state.seats.find((s) => s.seat !== 1 && s.alive);
      const secret = target?.lives?.secrets.find((sec) => !sec.destroyed);
      const concept = secret?.concept ?? target?.lives?.open[0];
      if (!concept) break;
      const r = await room.attack(1, concept);
      expect(r.ok).toBe(true);
      const before = room.state.round;
      await until(() => room.state.phase !== 'battle' || room.state.round > before, 5000);
    }
    expect(room.state.phase).toBe('finished');
    expect(room.state.winnerSeat).toBe(1);
  }, 20000);

  it('前提: 人間の固定 SECRET「灯台」は CPU 語彙プールに含まれない（friendly fire 自滅の防止）', async () => {
    const pool = await new DemoScorer().generateConcepts([], 14, []);
    expect(pool).not.toContain('灯台');
  });
});
