import type { GameConfig } from '@concept-curling/shared';
import { DEFAULT_CONFIG } from '@concept-curling/shared';
import type { GameState } from '../../src/engine/types.js';
import { addPlayer, createGame } from '../../src/engine/state.js';
import { applyThemes, startTheming } from '../../src/engine/theming.js';
import { applyScores, submitConcepts } from '../../src/engine/submitting.js';
import { pickLives } from '../../src/engine/picking.js';

/**
 * 既定は allSecret: false（従来の 1-secret + normals 前提のテスト群を活かすため）。
 * allSecret モード自体は picking.test.ts / battle.test.ts / resolve.test.ts で
 * cfg({ allSecret: true }) を明示的に指定して検証する。
 */
export function cfg(overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...DEFAULT_CONFIG, allSecret: false, ...overrides };
}

/** playerCount 人をフル着席させた waiting 状態を作る */
export function seated(config: GameConfig = cfg()): GameState {
  let state = createGame('ROOM01', config);
  for (let i = 1; i <= config.playerCount; i++) {
    const r = addPlayer(state, `P${i}`);
    if (!r.ok) throw new Error(r.error.message);
    state = r.value.state;
  }
  return state;
}

/** Result が ok であることを主張して値を返す */
export function unwrap<T>(
  r: { ok: true; value: T } | { ok: false; error: { code: string; message: string } },
): T {
  if (!r.ok) throw new Error(`unexpected err: ${r.error.code} ${r.error.message}`);
  return r.value;
}

/** submitting フェーズまで進めた状態（テーマは 星座/航海。themes.count は config に従う） */
export function inSubmitting(config: GameConfig = cfg()): GameState {
  const themes = ['星座', '航海', '茶道', '簿記'].slice(0, config.themes.count);
  return unwrap(applyThemes(unwrap(startTheming(seated(config))), themes));
}

/** 全席が同じ概念群とスコア表を提出し終えた状態を作る。scoresPerSeat[seatIndex][conceptIndex] = 各テーマ共通のスコア値 */
export function allScored(config: GameConfig = cfg(), flatScore = 40): GameState {
  let state = inSubmitting(config);
  for (const st of [...state.seats]) {
    const concepts = Array.from(
      { length: config.conceptsPerPlayer },
      (_, i) => `概念${st.seat}-${i}`,
    );
    state = unwrap(submitConcepts(state, st.seat, concepts));
    const table = concepts.map(() => ({
      scores: state.themes.map(() => flatScore),
      reasons: state.themes.map(() => '中距離の連想'),
    }));
    state = unwrap(applyScores(state, st.seat, table));
  }
  return state;
}

/**
 * battle フェーズまで進めた状態。各席 [0,1,2] を選抜し SECRET はインデックス 0（=概念X-0）。
 * config.allSecret を渡した場合は選抜した全部が SECRET になる。
 */
export function inBattle(config: GameConfig = cfg()): GameState {
  let state = allScored(config);
  for (const st of [...state.seats].filter((s) => s.alive)) {
    const selected = [0, 1, 2].slice(0, config.maxLives);
    const secretIndexes = config.allSecret ? selected : [0];
    state = unwrap(pickLives(state, st.seat, selected, secretIndexes));
  }
  return state;
}
