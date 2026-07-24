import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PrivateView, PublicState } from '@concept-curling/shared';

const resetGame = vi.fn().mockResolvedValue({ ok: true });
vi.mock('../src/api.js', async () => {
  const actual = await vi.importActual<typeof import('../src/api.js')>('../src/api.js');
  return { ...actual, api: { ...actual.api, resetGame } };
});

const gameValue = {
  connected: true,
  pub: {
    phase: 'finished',
    winnerSeat: 1,
    hostSeat: 1,
    players: [
      { seat: 1, name: 'アリス', alive: true, secretRevealed: '灯台', livesPublic: ['季節風'] },
      { seat: 2, name: 'ボブ', alive: false, secretRevealed: '風見鶏', livesPublic: [] },
    ],
  } as unknown as PublicState,
  priv: { seat: 1 } as unknown as PrivateView,
  clear: () => undefined,
};
vi.mock('../src/store.js', () => ({ useGame: () => gameValue }));

const { FinishedPanel } = await import('../src/components/FinishedPanel.js');

describe('FinishedPanel', () => {
  it('勝者と全 SECRET を表示し、ホストには再戦ボタンが出る', () => {
    const { container } = render(<FinishedPanel />);
    expect(screen.getByText('あなたの勝利')).toBeTruthy();
    expect(screen.getByText(/風見鶏/)).toBeTruthy();
    expect(screen.getByText('もう一戦')).toBeTruthy();
    expect(container.querySelector('.winner')?.textContent).toContain('勝利');
  });
});
