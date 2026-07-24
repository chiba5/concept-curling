import { describe, expect, it } from 'vitest';
import { applyThemes, startTheming } from '../../src/engine/theming.js';
import { cfg, seated, unwrap } from './helpers.js';

describe('startTheming', () => {
  it('満席の waiting から theming へ遷移する', () => {
    const s = unwrap(startTheming(seated()));
    expect(s.phase).toBe('theming');
  });
  it('満席でなければ not_full', () => {
    const s = seated(cfg({ playerCount: 3 }));
    s.seats.pop();
    const r = startTheming(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_full');
  });
  it('waiting 以外では bad_phase', () => {
    const s = { ...seated(), phase: 'battle' as const };
    const r = startTheming(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('bad_phase');
  });
});

describe('applyThemes', () => {
  it('テーマを確定し submitting へ遷移する', () => {
    const s0 = unwrap(startTheming(seated()));
    const s1 = unwrap(applyThemes(s0, ['星座', '航海']));
    expect(s1.phase).toBe('submitting');
    expect(s1.themes).toEqual(['星座', '航海']);
  });
  it('テーマ数が config.themes.count と不一致なら theme_count', () => {
    const s0 = unwrap(startTheming(seated()));
    const r = applyThemes(s0, ['星座']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('theme_count');
  });
  it('themes.count=3 の config なら 3 個で受理する', () => {
    const s = seated(cfg({ themes: { count: 3, mode: 'llm' } }));
    const s1 = unwrap(applyThemes(unwrap(startTheming(s)), ['星座', '航海', '茶道']));
    expect(s1.themes).toHaveLength(3);
  });
  it('theming 以外では bad_phase', () => {
    const r = applyThemes(seated(), ['星座', '航海']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('bad_phase');
  });
});
