import { describe, expect, it } from 'vitest';
import { DemoScorer, demoScore } from '../../src/scoring/demo.js';

describe('demoScore', () => {
  it('同一文字列は 0（bigram Jaccard 距離。DemoScorer 側で関連度に反転される）', () => {
    expect(demoScore('灯台', '灯台')).toBe(0);
  });
  it('bigram を共有しない語は 100', () => {
    expect(demoScore('灯台', '簿記')).toBe(100);
  });
  it('部分共有は中間値（ABC vs ABCD = 33）', () => {
    expect(demoScore('ABC', 'ABCD')).toBe(33);
  });
  it('対称である', () => {
    expect(demoScore('灯台守', '灯台')).toBe(demoScore('灯台', '灯台守'));
  });
  it('常に 0..100 の整数', () => {
    for (const [a, b] of [
      ['あ', 'い'],
      ['', ''],
      ['灯台守り', '守り神'],
    ]) {
      const v = demoScore(a ?? '', b ?? '');
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('DemoScorer', () => {
  const scorer = new DemoScorer();
  it('scorePairs は各ペアに score と reason「簡易採点」を返す（同一 85 / 無関係 25）', async () => {
    const r = await scorer.scorePairs([
      { a: '灯台', b: '灯台' },
      { a: '灯台', b: '簿記' },
    ]);
    expect(r).toEqual([
      { score: 85, reason: '簡易採点' },
      { score: 25, reason: '簡易採点' },
    ]);
  });
  it('generateThemes は指定個数の重複なし日本語テーマを返す', async () => {
    const t = await scorer.generateThemes(4);
    expect(t).toHaveLength(4);
    expect(new Set(t).size).toBe(4);
    expect(t.every((x) => typeof x === 'string' && x.length > 0)).toBe(true);
  });
  it('generateConcepts は指定個数の重複なし概念を返す', async () => {
    const c = await scorer.generateConcepts(['星座', '航海'], 9, []);
    expect(c).toHaveLength(9);
    expect(new Set(c).size).toBe(9);
  });
  it('generateConcepts は avoid に含まれる概念を除外する', async () => {
    const avoid = ['羊皮紙', '炊飯器', '季節風', '簿記', '水平線', '風見鶏', '燭台'];
    const c = await scorer.generateConcepts(['星座'], 5, avoid);
    expect(c).toHaveLength(5);
    expect(c.every((x) => !avoid.includes(x))).toBe(true);
  });
  it('generateAttack は非空文字列を返し、avoid の語は使わない', async () => {
    for (let i = 0; i < 20; i++) {
      const dodged = await scorer.generateAttack(
        ['星座'],
        ['灯台', '簿記'],
        ['灯台装置', '簿装置'],
      );
      expect(dodged.trim().length).toBeGreaterThan(0);
      expect(['灯台装置', '簿装置']).not.toContain(dodged);
    }
    const a = await scorer.generateAttack(['星座'], ['灯台', '簿記'], []);
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
  });
});
