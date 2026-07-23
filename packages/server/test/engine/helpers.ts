import type { GameConfig } from '@concept-curling/shared';
import { DEFAULT_CONFIG } from '@concept-curling/shared';
import type { GameState } from '../../src/engine/types.js';
import { addPlayer, createGame } from '../../src/engine/state.js';

export function cfg(overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
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
