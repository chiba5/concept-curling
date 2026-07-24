import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrivateView, PublicState } from '@concept-curling/shared';

const resetGame = vi.fn().mockResolvedValue({ ok: true });
vi.mock('../src/api.js', async () => {
  const actual = await vi.importActual<typeof import('../src/api.js')>('../src/api.js');
  return { ...actual, api: { ...actual.api, resetGame } };
});

const initialGameValue = {
  connected: true,
  pub: {
    phase: 'finished',
    winnerSeat: 1,
    hostSeat: 1,
    players: [
      { seat: 1, name: 'アリス', alive: true, revealedSecrets: ['灯台'], livesPublic: ['季節風'] },
      { seat: 2, name: 'ボブ', alive: false, revealedSecrets: ['風見鶏'], livesPublic: [] },
    ],
  } as unknown as PublicState,
  priv: { seat: 1 } as unknown as PrivateView,
  clear: () => undefined,
};
let gameValue = initialGameValue;
vi.mock('../src/store.js', () => ({ useGame: () => gameValue }));

const { FinishedPanel } = await import('../src/components/FinishedPanel.js');

describe('FinishedPanel', () => {
  beforeEach(() => {
    gameValue = initialGameValue;
  });

  it('勝者と全 SECRET を表示し、ホストには再戦ボタンが出る', () => {
    const { container } = render(<FinishedPanel />);
    expect(screen.getByText('あなたの勝利')).toBeTruthy();
    expect(screen.getByText(/風見鶏/)).toBeTruthy();
    expect(screen.getByText('もう一戦')).toBeTruthy();
    expect(container.querySelector('.winner')?.textContent).toContain('勝利');
  });

  it('勝者には 勝 スタンプと紙吹雪、敗者には 敗 スタンプが出る', () => {
    const { container, unmount } = render(<FinishedPanel />);
    expect(container.querySelector('.stamp-win')?.textContent).toBe('勝');
    expect(container.querySelector('.confetti')).toBeTruthy();
    unmount();
    gameValue = { ...gameValue, priv: { seat: 2 } as unknown as PrivateView };
    const { container: c2 } = render(<FinishedPanel />);
    expect(c2.querySelector('.stamp-lose')?.textContent).toBe('敗');
    expect(c2.querySelector('.confetti')).toBeNull();
  });
});
