import type { Controller, GameConfig } from '@concept-curling/shared';
import type { GameState, Result, SeatState } from './types.js';
import { err, ok } from './types.js';

export function createGame(roomId: string, config: GameConfig): GameState {
  return {
    roomId,
    config,
    phase: 'waiting',
    round: 0,
    themes: [],
    seats: [],
    turns: [],
    winnerSeat: null,
    hostSeat: 1,
  };
}

export function getSeat(state: GameState, seat: number): SeatState | undefined {
  return state.seats.find((s) => s.seat === seat);
}

export function isFull(state: GameState): boolean {
  return state.seats.length === state.config.playerCount;
}

export function addPlayer(
  state: GameState,
  name: string,
  controller: Controller = 'human',
): Result<{ state: GameState; seat: number }> {
  if (state.phase !== 'waiting') return err('bad_phase', '参加は待機中のみ可能です');
  if (isFull(state)) return err('room_full', '満席です');
  const next = structuredClone(state);
  const seat = next.seats.length + 1;
  next.seats.push({
    seat,
    name,
    controller,
    connected: controller === 'human',
    alive: true,
    submittedConcepts: null,
    candidates: null,
    lives: null,
    attack: null,
  });
  return ok({ state: next, seat });
}

function updateSeat(state: GameState, seat: number, mutate: (s: SeatState) => void): Result {
  if (!getSeat(state, seat)) return err('no_seat', `席 ${seat} は存在しません`);
  const next = structuredClone(state);
  const target = next.seats.find((s) => s.seat === seat);
  if (target) mutate(target);
  return ok(next);
}

export function setConnected(state: GameState, seat: number, connected: boolean): Result {
  return updateSeat(state, seat, (s) => {
    s.connected = connected;
  });
}

export function setController(state: GameState, seat: number, controller: Controller): Result {
  return updateSeat(state, seat, (s) => {
    s.controller = controller;
  });
}

/**
 * waiting 中のみ。席を削除し、後続の席番号を前に詰める（seats 昇順・欠番なし不変条件の維持）。
 * 呼び出し側（Room）は token→seat 対応の振り直しを行うこと。
 */
export function removePlayer(state: GameState, seat: number): Result {
  if (state.phase !== 'waiting') return err('bad_phase', '退室処理は待機中のみ');
  if (!getSeat(state, seat)) return err('no_seat', `席 ${seat} は存在しません`);
  const next = structuredClone(state);
  next.seats = next.seats.filter((s) => s.seat !== seat);
  next.seats.forEach((s, i) => {
    s.seat = i + 1;
  });
  return ok(next);
}

/** 席メタ（name/controller/connected）を保持してゲームデータのみ初期化し waiting へ戻す（再戦用） */
export function resetGame(state: GameState): Result {
  const next = createGame(state.roomId, state.config);
  next.seats = state.seats.map((s) => ({
    seat: s.seat,
    name: s.name,
    controller: s.controller,
    connected: s.connected,
    alive: true,
    submittedConcepts: null,
    candidates: null,
    lives: null,
    attack: null,
  }));
  return ok(next);
}
