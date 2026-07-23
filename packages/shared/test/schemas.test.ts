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
  it('destroyBand.min >= max を拒否する', () => {
    expect(
      gameConfigSchema.safeParse({ ...DEFAULT_CONFIG, destroyBand: { min: 50, max: 50 } }).success,
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
  it('secretIndex が selectedIndices に含まれない場合を拒否する', () => {
    expect(pickLivesSchema.safeParse({ selectedIndices: [0, 2], secretIndex: 1 }).success).toBe(
      false,
    );
  });
  it('secretIndex が selectedIndices 内なら受理する', () => {
    expect(pickLivesSchema.safeParse({ selectedIndices: [0, 2], secretIndex: 2 }).success).toBe(
      true,
    );
  });
  it('selectedIndices の重複を拒否する', () => {
    expect(pickLivesSchema.safeParse({ selectedIndices: [1, 1], secretIndex: 1 }).success).toBe(
      false,
    );
  });
  it('空の selectedIndices を拒否する', () => {
    expect(pickLivesSchema.safeParse({ selectedIndices: [], secretIndex: 0 }).success).toBe(false);
  });
});

describe('attackSchema', () => {
  it('前後空白をトリムして受理する', () => {
    const r = attackSchema.parse({ concept: ' 灯台 ' });
    expect(r.concept).toBe('灯台');
  });
});
