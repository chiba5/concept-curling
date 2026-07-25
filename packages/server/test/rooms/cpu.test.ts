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

describe('decideAttack（仮説駆動）', () => {
  /** score(a,b) をテーブルで返すスタブ。未定義ペアは 10（遠い） */
  const stub = (opts: {
    hypos?: string[];
    attacks?: string[];
    table?: Record<string, number>;
  }): Scorer => {
    let gi = 0;
    return {
      scorePairs: vi.fn((pairs: { a: string; b: string }[]) =>
        Promise.resolve(
          pairs.map((p) => ({ score: opts.table?.[`${p.a}|${p.b}`] ?? 10, reason: 'r' })),
        ),
      ),
      generateThemes: vi.fn(),
      generateConcepts: vi.fn(),
      generateHypotheses: vi.fn(() => Promise.resolve(opts.hypos ?? [])),
      generateAttack: vi.fn(() =>
        Promise.resolve(opts.attacks?.[Math.min(gi++, (opts.attacks?.length ?? 1) - 1)] ?? ''),
      ),
    } as unknown as Scorer;
  };
  const ctx = (over: Partial<Parameters<typeof decideAttack>[1]> = {}) => ({
    themes: ['星座'],
    ownLives: ['書庫'],
    opponents: [{ seat: 2, name: '相手', livesRemaining: 2, openLives: [] }],
    clues: [
      {
        seat: 2,
        owner: '相手',
        life: '秘1',
        hints: [{ attack: '嵐', score: 60 }],
      },
    ],
    avoid: [],
    destroyThreshold: 70,
    ...over,
  });
  it('判定録との誤差が最小の安全な仮説を採用する', async () => {
    // A は観測(嵐=60)と整合、B は不整合。両方安全 → A
    const s = stub({
      hypos: ['A', 'B'],
      table: { 'A|嵐': 60, 'B|嵐': 10, 'A|書庫': 20, 'B|書庫': 20 },
    });
    await expect(decideAttack(s, ctx())).resolves.toBe('A');
  });
  it('誤差最小でも自ライフに破壊圏なら次の安全な仮説へ回す', async () => {
    const s = stub({
      hypos: ['A', 'B'],
      table: { 'A|嵐': 60, 'B|嵐': 55, 'A|書庫': 90, 'B|書庫': 20 },
    });
    await expect(decideAttack(s, ctx())).resolves.toBe('B');
  });
  it('残りライフ最多の相手の手掛かりで推理する（主標的の選択）', async () => {
    const s = stub({ hypos: ['A'], table: { 'A|書庫': 20 } });
    await decideAttack(
      s,
      ctx({
        opponents: [
          { seat: 2, name: '弱い方', livesRemaining: 1, openLives: [] },
          { seat: 3, name: '強い方', livesRemaining: 3, openLives: [] },
        ],
        clues: [
          { seat: 2, owner: '弱い方', life: '秘1', hints: [{ attack: '弱ヒント', score: 50 }] },
          { seat: 3, owner: '強い方', life: '秘1', hints: [{ attack: '強ヒント', score: 50 }] },
        ],
      }),
    );
    const call = (s.generateHypotheses as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[1]).toEqual([{ attack: '強ヒント', score: 50 }]);
  });
  it('仮説が無ければ従来生成にフォールバックし、安全な語を採用する', async () => {
    const s = stub({ hypos: [], attacks: ['安全な語'], table: { '安全な語|書庫': 30 } });
    await expect(decideAttack(s, ctx())).resolves.toBe('安全な語');
  });
  it('生成が全て破壊圏なら中立プールの最小リスク語を出す（自滅攻撃は決して投げない）', async () => {
    const table: Record<string, number> = {
      '危険A|書庫': 95,
      '危険B|書庫': 90,
      '危険C|書庫': 85,
    };
    const s = stub({ hypos: [], attacks: ['危険A', '危険B', '危険C'], table });
    const a = await decideAttack(s, ctx());
    expect(['危険A', '危険B', '危険C']).not.toContain(a);
    expect(a.trim().length).toBeGreaterThan(0);
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
