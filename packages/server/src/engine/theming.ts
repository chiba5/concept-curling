import type { GameState, Result } from './types.js';
import { err, ok } from './types.js';
import { isFull } from './state.js';

export function startTheming(state: GameState): Result {
  if (state.phase !== 'waiting') return err('bad_phase', 'テーマ生成は待機中からのみ');
  if (!isFull(state)) return err('not_full', '全員が揃っていません');
  const next = structuredClone(state);
  next.phase = 'theming';
  return ok(next);
}

export function applyThemes(state: GameState, themes: string[]): Result {
  if (state.phase !== 'theming') return err('bad_phase', 'テーマ確定は theming 中のみ');
  if (themes.length !== state.config.themes.count)
    return err('theme_count', `テーマは ${state.config.themes.count} 個必要です`);
  const next = structuredClone(state);
  next.themes = [...themes];
  next.phase = 'submitting';
  return ok(next);
}
