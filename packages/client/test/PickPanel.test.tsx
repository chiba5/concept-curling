import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PrivateView, PublicState, ScoredCandidate } from '@concept-curling/shared';

const pickLives = vi.fn().mockResolvedValue({ ok: true });
vi.mock('../src/api.js', async () => {
  const actual = await vi.importActual<typeof import('../src/api.js')>('../src/api.js');
  return { ...actual, api: { ...actual.api, pickLives } };
});

const cand = (concept: string, total: number, pickable: boolean): ScoredCandidate => ({
  concept,
  scores: [total / 2, total / 2],
  reasons: ['理由A', '理由B'],
  total,
  pickable,
});
const gameValue = {
  connected: true,
  pub: {
    phase: 'picking',
    config: { maxLives: 3, pickSumLimit: 150 },
    players: [],
    themes: ['星座', '航海'],
  } as unknown as PublicState,
  priv: {
    seat: 1,
    candidates: [cand('灯台', 120, true), cand('炊飯器', 180, false), cand('季節風', 100, true)],
    myLives: { normals: [], secret: null, secretDestroyed: false },
  } as unknown as PrivateView,
  clear: () => undefined,
};
vi.mock('../src/store.js', () => ({ useGame: () => gameValue }));

const { PickPanel } = await import('../src/components/PickPanel.js');

describe('PickPanel', () => {
  it('候補・スコア・理由を表示し、上限超は選択不可', () => {
    render(<PickPanel />);
    expect(screen.getByText('灯台')).toBeTruthy();
    expect(screen.getAllByText('理由A').length).toBeGreaterThan(0);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
    expect((checkboxes[1] as HTMLInputElement).disabled).toBe(true);
  });
  it('選抜 + SECRET 指定で candidates インデックスを送信する', async () => {
    render(<PickPanel />);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0] as HTMLElement); // 灯台 (index 0)
    fireEvent.click(checkboxes[2] as HTMLElement); // 季節風 (index 2)
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[2] as HTMLElement); // SECRET = 季節風
    fireEvent.click(screen.getByText('この構成で確定'));
    await vi.waitFor(() =>
      expect(pickLives).toHaveBeenCalledWith({ selectedIndices: [0, 2], secretIndex: 2 }),
    );
  });
});
