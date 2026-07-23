import type {
  Controller,
  GameConfig,
  Phase,
  ScoredCandidate,
  TurnRecord,
} from '@concept-curling/shared';

/** SECRET ライフの内部表現 */
export interface SecretLife {
  concept: string;
  destroyed: boolean;
  revealed: boolean;
}

export interface SeatState {
  seat: number; // 1..playerCount
  name: string;
  controller: Controller;
  connected: boolean;
  alive: boolean;
  /** submitting: 提出済み概念（未提出は null） */
  submittedConcepts: string[] | null;
  /** submitting: 採点済み候補（未採点は null） */
  candidates: ScoredCandidate[] | null;
  /** picking 完了までは null */
  lives: { normals: string[]; secret: SecretLife | null } | null;
  /** battle: このターンの攻撃（未提出は null） */
  attack: string | null;
}

export interface GameState {
  roomId: string;
  config: GameConfig;
  phase: Phase;
  round: number;
  themes: string[];
  seats: SeatState[];
  turns: TurnRecord[];
  winnerSeat: number | null;
  hostSeat: number;
}

export interface EngineError {
  code: string;
  message: string;
}

export type Result<T = GameState> = { ok: true; value: T } | { ok: false; error: EngineError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <T = GameState>(code: string, message: string): Result<T> => ({
  ok: false,
  error: { code, message },
});

/** 生存ライフ数（保存しない。常に計算）*/
export function lifeCount(seat: SeatState): number {
  if (!seat.lives) return 0;
  const secretAlive = seat.lives.secret && !seat.lives.secret.destroyed ? 1 : 0;
  return seat.lives.normals.length + secretAlive;
}

export function aliveSeats(state: GameState): SeatState[] {
  return state.seats.filter((s) => s.alive);
}
