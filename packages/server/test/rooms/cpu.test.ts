import type { ScoredCandidate } from '@concept-curling/shared';
import { describe, expect, it } from 'vitest';
import { decidePick } from '../../src/rooms/cpu.js';

const cand = (concept: string, total: number, pickable: boolean): ScoredCandidate => ({
  concept,
  scores: [total / 2, total / 2],
  reasons: ['r', 'r'],
  total,
  pickable,
});

describe('decidePick', () => {
  const candidates = [
    cand('甲', 120, true),
    cand('乙', 80, true),
    cand('丙', 160, false),
    cand('丁', 100, true),
    cand('戊', 90, true),
  ];
  it('pickable の中から合計の低い順に maxLives 個選ぶ', () => {
    const r = decidePick(candidates, 3);
    expect(r?.selectedIndices).toEqual([1, 3, 4]); // 乙80, 戊90, 丁100（昇順に整列）
  });
  it('SECRET は選抜内から選ばれる', () => {
    for (let i = 0; i < 20; i++) {
      const r = decidePick(candidates, 2);
      expect(r).not.toBeNull();
      if (r) expect(r.selectedIndices).toContain(r.secretIndex);
    }
  });
  it('maxLives 1 なら最小合計の 1 つ', () => {
    const r = decidePick(candidates, 1);
    expect(r).toEqual({ selectedIndices: [1], secretIndex: 1 });
  });
  it('pickable が 0 件なら null（エンジン側で即敗北済みの局面）', () => {
    expect(decidePick([cand('甲', 200, false)], 3)).toBeNull();
  });
});
