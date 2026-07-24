import type { ScoredCandidate } from '@concept-curling/shared';
import { describe, expect, it, vi } from 'vitest';
import { decideAttack, decidePick } from '../../src/rooms/cpu.js';
import type { Scorer } from '../../src/scoring/scorer.js';

const cand = (concept: string, total: number, pickable: boolean): ScoredCandidate => ({
  concept,
  scores: [total / 2, total / 2],
  reasons: ['r', 'r'],
  total,
  pickable,
});

describe('decidePick（allSecret: false）', () => {
  const candidates = [
    cand('甲', 120, true),
    cand('乙', 80, true),
    cand('丙', 160, false),
    cand('丁', 100, true),
    cand('戊', 90, true),
  ];
  it('pickable の中から合計の低い（=推測されにくい）順に maxLives 個選ぶ', () => {
    const r = decidePick(candidates, 3, false);
    expect(r?.selectedIndices).toEqual([1, 3, 4]); // 乙80, 戊90, 丁100（昇順に整列）
  });
  it('SECRET は選抜内から 1 個だけランダムに選ばれる', () => {
    for (let i = 0; i < 20; i++) {
      const r = decidePick(candidates, 2, false);
      expect(r).not.toBeNull();
      if (r) {
        expect(r.secretIndexes).toHaveLength(1);
        expect(r.selectedIndices).toContain(r.secretIndexes[0]);
      }
    }
  });
  it('maxLives 1 なら pickable の最小合計の 1 つ', () => {
    const r = decidePick(candidates, 1, false);
    expect(r).toEqual({ selectedIndices: [1], secretIndexes: [1] });
  });
  it('pickable が 0 件なら null（エンジン側で即敗北済みの局面）', () => {
    expect(decidePick([cand('甲', 200, false)], 3, false)).toBeNull();
  });
});

describe('decidePick（pairScore による分散）', () => {
  it('互いに関連の高い候補は同時に選ばず、離れた組を優先する', () => {
    // 乙(35)と丙(40)は関連 90。低合計順の 甲乙丙 でなく、丙を飛ばして丁を選ぶべき
    const candidates = [
      cand('甲', 30, true),
      cand('乙', 35, true),
      cand('丙', 40, true),
      cand('丁', 45, true),
    ];
    const pair = [
      [100, 10, 10, 10],
      [10, 100, 90, 10],
      [10, 90, 100, 10],
      [10, 10, 10, 100],
    ];
    const r = decidePick(candidates, 3, true, pair);
    expect(r?.selectedIndices).toEqual([0, 1, 3]); // 甲・乙・丁（丙は乙と近すぎる）
  });
});

describe('decideAttack（自滅の自己検査）', () => {
  const stub = (attacks: string[], riskByAttack: Record<string, number>): Scorer => {
    let call = 0;
    return {
      scorePairs: vi.fn((pairs: { a: string; b: string }[]) =>
        Promise.resolve(pairs.map((p) => ({ score: riskByAttack[p.a] ?? 0, reason: 'r' }))),
      ),
      generateThemes: vi.fn(),
      generateConcepts: vi.fn(),
      generateAttack: vi.fn(() =>
        Promise.resolve(attacks[Math.min(call++, attacks.length - 1)] ?? ''),
      ),
    } as unknown as Scorer;
  };
  it('自分のライフとの関連が閾値未満ならそのまま採用する', async () => {
    const s = stub(['安全な語'], { 安全な語: 30 });
    await expect(
      decideAttack(s, ['星座'], ['灯台'], [], { ownLives: ['書庫'], clues: [] }, 70),
    ).resolves.toBe('安全な語');
  });
  it('破壊圏なら作り直し、2 案目が安全ならそちらを使う', async () => {
    const s = stub(['危険な語', '安全な語'], { 危険な語: 85, 安全な語: 20 });
    await expect(
      decideAttack(s, ['星座'], ['灯台'], [], { ownLives: ['書庫'], clues: [] }, 70),
    ).resolves.toBe('安全な語');
    // 2 回目の生成には 1 案目が禁止語として渡る
    const gen = (s.generateAttack as ReturnType<typeof vi.fn>).mock.calls;
    expect(gen[1]?.[2]).toContain('危険な語');
  });
  it('2 案とも破壊圏なら自滅リスクの低い方を使う', async () => {
    const s = stub(['危険A', '危険B'], { 危険A: 95, 危険B: 75 });
    await expect(
      decideAttack(s, ['星座'], ['灯台'], [], { ownLives: ['書庫'], clues: [] }, 70),
    ).resolves.toBe('危険B');
  });
  it('自分のライフが無ければ検査せず 1 案目を使う', async () => {
    const s = stub(['何でも'], {});
    await expect(
      decideAttack(s, ['星座'], ['灯台'], [], { ownLives: [], clues: [] }, 70),
    ).resolves.toBe('何でも');
    expect(s.scorePairs).not.toHaveBeenCalled();
  });
});

describe('decidePick（allSecret: true）', () => {
  const candidates = [
    cand('甲', 120, true),
    cand('乙', 80, true),
    cand('丙', 160, false),
    cand('丁', 100, true),
  ];
  it('selectedIndices 全部が secretIndexes になる', () => {
    const r = decidePick(candidates, 3, true);
    expect(r?.selectedIndices).toEqual([0, 1, 3]);
    expect(r?.secretIndexes).toEqual([0, 1, 3]);
  });
});
