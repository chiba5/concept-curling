import type { GameConfig } from './types.js';

/** ルーム設定の可変範囲 */
export const CONFIG_LIMITS = {
  playerCount: { min: 2, max: 6 },
  conceptsPerPlayer: { min: 3, max: 9 },
  themesCount: { min: 1, max: 4 },
  graceSeconds: { min: 10, max: 300 },
} as const;

/** ルーム作成フォームの初期値（現行ゲームと同一ルール） */
export const DEFAULT_CONFIG: GameConfig = {
  playerCount: 3,
  conceptsPerPlayer: 5,
  maxLives: 3,
  pickMinTotal: 50,
  destroyThreshold: 70,
  allSecret: true,
  themes: { count: 2, mode: 'llm' },
  graceSeconds: 60,
};

/** テーマ数から pickMinTotal の推奨初期値を出す（UI 用）。
 * v2.5 で ×15 → ×25 に引き上げ: 下限が低いとテーマ無関係の語（例: MCP）が実質無敵のライフになり、
 * 推理ゲームとして成立しないことを本番対局で確認した */
export const suggestedPickMinTotal = (themeCount: number): number => themeCount * 25;

export const MAX_CONCEPT_LENGTH = 20;
export const MAX_NAME_LENGTH = 12;
export const ROOM_ID_LENGTH = 6;
export const ROOM_GC_MINUTES = 30;
