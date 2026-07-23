import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicState } from '@concept-curling/shared';

type Handler = (...args: unknown[]) => void;
const handlers = new Map<string, Handler>();
vi.mock('../src/socket.js', () => ({
  getSocket: () => ({
    on: (ev: string, fn: Handler) => handlers.set(ev, fn),
    off: (ev: string) => handlers.delete(ev),
    connected: true,
  }),
}));

const { GameProvider, useGame } = await import('../src/store.js');

function Probe() {
  const { pub } = useGame();
  return <p>phase: {pub?.phase ?? 'none'}</p>;
}

describe('GameProvider', () => {
  it('state イベントで pub が更新される', () => {
    render(
      <GameProvider>
        <Probe />
      </GameProvider>,
    );
    expect(screen.getByText('phase: none')).toBeTruthy();
    act(() => {
      handlers.get('state')?.({
        phase: 'waiting',
        players: [],
        turns: [],
      } as unknown as PublicState);
    });
    expect(screen.getByText('phase: waiting')).toBeTruthy();
  });
});
