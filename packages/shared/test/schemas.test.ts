import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  attackSchema,
  gameConfigSchema,
  pickLivesSchema,
  submitConceptsSchema,
} from '../src/index.js';

describe('gameConfigSchema', () => {
  it('既定設定を受理する', () => {
    expect(gameConfigSchema.safeParse(DEFAULT_CONFIG).success).toBe(true);
  });
  it('人数 1 / 7 を拒否する', () => {
    expect(gameConfigSchema.safeParse({ ...DEFAULT_CONFIG, playerCount: 1 }).success).toBe(false);
    expect(gameConfigSchema.safeParse({ ...DEFAULT_CONFIG, playerCount: 7 }).success).toBe(false);
  });
  it('maxLives >= conceptsPerPlayer を拒否する', () => {
    expect(
      gameConfigSchema.safeParse({ ...DEFAULT_CONFIG, conceptsPerPlayer: 3, maxLives: 3 }).success,
    ).toBe(false);
  });
  it('destroyThreshold は 0..99 の範囲外を拒否する', () => {
    expect(gameConfigSchema.safeParse({ ...DEFAULT_CONFIG, destroyThreshold: 100 }).success).toBe(
      false,
    );
    expect(gameConfigSchema.safeParse({ ...DEFAULT_CONFIG, destroyThreshold: -1 }).success).toBe(
      false,
    );
  });
  it('pickMinTotal がテーマ数 × 100 超を拒否する', () => {
    expect(
      gameConfigSchema.safeParse({ ...DEFAULT_CONFIG, pickMinTotal: 201 }).success, // themes.count=2 → 上限200
    ).toBe(false);
  });
  it('manual テーマの個数不一致を拒否する', () => {
    expect(
      gameConfigSchema.safeParse({
        ...DEFAULT_CONFIG,
        themes: { count: 2, mode: 'manual', manual: ['星座'] },
      }).success,
    ).toBe(false);
  });
  it('manual テーマ個数一致を受理する', () => {
    expect(
      gameConfigSchema.safeParse({
        ...DEFAULT_CONFIG,
        themes: { count: 2, mode: 'manual', manual: ['星座', '航海'] },
      }).success,
    ).toBe(true);
  });
});

describe('submitConceptsSchema', () => {
  it('空文字・空白のみの概念を拒否する', () => {
    expect(submitConceptsSchema.safeParse({ concepts: ['灯台', '  '] }).success).toBe(false);
  });
  it('21 文字の概念を拒否する', () => {
    expect(submitConceptsSchema.safeParse({ concepts: ['あ'.repeat(21)] }).success).toBe(false);
  });
  it('個数はスキーマでは検証しない（config 依存のためエンジンで検証）', () => {
    expect(submitConceptsSchema.safeParse({ concepts: ['灯台'] }).success).toBe(true);
  });
});

describe('pickLivesSchema', () => {
  it('secretIndexes が selectedIndices に含まれない要素を持つ場合を拒否する', () => {
    expect(pickLivesSchema.safeParse({ selectedIndices: [0, 2], secretIndexes: [1] }).success).toBe(
      false,
    );
  });
  it('secretIndexes が selectedIndices の部分集合なら受理する', () => {
    expect(pickLivesSchema.safeParse({ selectedIndices: [0, 2], secretIndexes: [2] }).success).toBe(
      true,
    );
    expect(
      pickLivesSchema.safeParse({ selectedIndices: [0, 2], secretIndexes: [0, 2] }).success,
    ).toBe(true);
  });
  it('selectedIndices の重複を拒否する', () => {
    expect(pickLivesSchema.safeParse({ selectedIndices: [1, 1], secretIndexes: [1] }).success).toBe(
      false,
    );
  });
  it('secretIndexes の重複を拒否する', () => {
    expect(
      pickLivesSchema.safeParse({ selectedIndices: [1, 2], secretIndexes: [1, 1] }).success,
    ).toBe(false);
  });
  it('空の selectedIndices を拒否する', () => {
    expect(pickLivesSchema.safeParse({ selectedIndices: [], secretIndexes: [0] }).success).toBe(
      false,
    );
  });
  it('空の secretIndexes を拒否する', () => {
    expect(pickLivesSchema.safeParse({ selectedIndices: [0], secretIndexes: [] }).success).toBe(
      false,
    );
  });
});

describe('attackSchema', () => {
  it('前後空白をトリムして受理する', () => {
    const r = attackSchema.parse({ concept: ' 灯台 ' });
    expect(r.concept).toBe('灯台');
  });
});
