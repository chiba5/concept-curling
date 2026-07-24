import type { PrivateView, PublicState } from '@concept-curling/shared';
import type { GameState, SeatState } from './types.js';
import { lifeCount } from './types.js';

function isReady(state: GameState, s: SeatState): boolean {
  if (!s.alive) return false;
  switch (state.phase) {
    case 'submitting':
      return s.submittedConcepts !== null;
    case 'picking':
      return s.lives !== null;
    case 'battle':
      return s.attack !== null;
    default:
      return false;
  }
}

export function toPublicState(state: GameState): PublicState {
  return {
    roomId: state.roomId,
    phase: state.phase,
    round: state.round,
    themes: [...state.themes],
    config: structuredClone(state.config),
    players: state.seats.map((s) => ({
      seat: s.seat,
      name: s.name,
      controller: s.controller,
      connected: s.connected,
      alive: s.alive,
      ready: isReady(state, s),
      lifeCount: lifeCount(s),
      livesPublic: s.lives ? [...s.lives.open] : [],
      revealedSecrets: s.lives
        ? s.lives.secrets
            .filter((sec) => sec.revealed || state.phase === 'finished')
            .map((sec) => sec.concept)
        : [],
      secretCount: s.lives ? s.lives.secrets.filter((sec) => !sec.destroyed).length : 0,
      graceDeadline: null, // Room が上書きする
    })),
    turns: structuredClone(state.turns),
    winnerSeat: state.winnerSeat,
    hostSeat: state.hostSeat,
  };
}

/** seat は呼び出し側で検証済み前提（不在席には空ビューを返す） */
export function toPrivateView(state: GameState, seat: number, playerToken: string): PrivateView {
  const s = state.seats.find((x) => x.seat === seat);
  return {
    seat,
    playerToken,
    myConcepts: s?.submittedConcepts ? [...s.submittedConcepts] : null,
    candidates: s?.candidates ? structuredClone(s.candidates) : [],
    myLives: {
      open: s?.lives ? [...s.lives.open] : [],
      secrets: s?.lives
        ? s.lives.secrets.map((sec) => ({ concept: sec.concept, destroyed: sec.destroyed }))
        : [],
    },
    attackSubmitted: s?.attack !== null && s?.attack !== undefined,
  };
}
