import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicPlayer } from '@concept-curling/shared';
import { PlayerStrip } from '../src/components/PlayerStrip.js';

const player = (over: Partial<PublicPlayer>): PublicPlayer => ({
  seat: 1,
  name: 'アリス',
  controller: 'human',
  connected: true,
  alive: true,
  ready: false,
  lifeCount: 3,
  livesPublic: ['灯台', '季節風'],
  revealedSecrets: [],
  secretCount: 1,
  graceDeadline: null,
  ...over,
});

describe('PlayerStrip', () => {
  it('公開ライフ・SECRET マーク・準備状態を表示する', () => {
    render(
      <PlayerStrip
        players={[player({}), player({ seat: 2, name: 'ボブ', ready: true })]}
        mySeat={1}
      />,
    );
    expect(screen.getAllByText('灯台')).toHaveLength(2);
    expect(screen.getAllByText('秘')).toHaveLength(2);
    expect(screen.getByText('済')).toBeTruthy();
  });
  it('複数の SECRET マークと公開済み SECRET を表示する', () => {
    render(
      <PlayerStrip
        players={[player({ secretCount: 3, revealedSecrets: ['灯台', '季節風'] })]}
        mySeat={1}
      />,
    );
    expect(screen.getAllByText('秘')).toHaveLength(3);
    expect(screen.getByText('公開: 灯台、季節風')).toBeTruthy();
  });
  it('脱落・CPU 代打・grace カウントダウンを表示する', () => {
    vi.setSystemTime(1_000_000);
    render(
      <PlayerStrip
        players={[
          player({ alive: false, lifeCount: 0, livesPublic: [], secretCount: 0 }),
          player({ seat: 2, name: 'ボブ', controller: 'cpu' }),
          player({
            seat: 3,
            name: 'キャロル',
            connected: false,
            graceDeadline: 1_000_000 + 42_000,
          }),
        ]}
        mySeat={1}
      />,
    );
    expect(screen.getByText('脱落')).toBeTruthy();
    expect(screen.getByText('CPU')).toBeTruthy();
    expect(screen.getByText(/42\s*秒/)).toBeTruthy();
    vi.useRealTimers();
  });
});
