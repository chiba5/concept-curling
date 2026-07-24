import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicPlayer, TurnRecord } from '@concept-curling/shared';
import { ResolutionReveal, buildSteps } from '../src/components/ResolutionReveal.js';

const players = [
  { seat: 1, name: 'アリス' },
  { seat: 2, name: 'ボブ' },
] as PublicPlayer[];

const turn: TurnRecord = {
  round: 1,
  attacks: [
    { seat: 1, concept: '嵐' },
    { seat: 2, concept: '雷' },
  ],
  details: [
    {
      atkSeat: 1,
      atkConcept: '嵐',
      targetSeat: 2,
      targetKind: 'normal',
      targetOrdinal: 0,
      targetLabel: '風見鶏',
      score: 60,
      reason: '気象由来の近縁',
      destroyed: true,
    },
    {
      atkSeat: 2,
      atkConcept: '雷',
      targetSeat: 1,
      targetKind: 'secret',
      targetOrdinal: 0,
      targetLabel: 'SECRET',
      score: 10,
      reason: '遠い',
      destroyed: false,
    },
  ],
  destroys: [{ seat: 2, kind: 'normal', concept: '風見鶏' }],
  reveals: [],
  eliminatedSeats: [2],
};

describe('buildSteps', () => {
  it('attack → hits の順でステップを組み立て、不発・脱落も含む', () => {
    const steps = buildSteps(turn, players);
    expect(steps.map((s) => s.kind)).toEqual(['attack', 'hit', 'attack', 'miss', 'eliminated']);
    expect(steps[0]).toMatchObject({ text: '嵐', sub: 'アリス の攻撃' });
    expect(steps[1]).toMatchObject({ text: '風見鶏', score: 60 });
    expect(steps[2]).toMatchObject({ text: '雷', sub: 'ボブ の攻撃' });
    expect(steps[3]).toMatchObject({ text: '不発' });
    expect(steps[4]).toMatchObject({ text: 'ボブ 脱落' });
  });

  it('SECRET のライフを破壊した場合は「秘」と表示する', () => {
    const secretHitTurn: TurnRecord = {
      ...turn,
      attacks: [{ seat: 1, concept: '嵐' }],
      details: [
        {
          atkSeat: 1,
          atkConcept: '嵐',
          targetSeat: 2,
          targetKind: 'secret',
          targetOrdinal: 0,
          targetLabel: 'SECRET',
          score: 60,
          reason: '気象由来の近縁',
          destroyed: true,
        },
      ],
      eliminatedSeats: [],
    };
    const steps = buildSteps(secretHitTurn, players);
    expect(steps[1]?.text).toBe('秘');
  });
});

describe('ResolutionReveal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ステップが時間経過とともに進み、最後に onDone が呼ばれる', () => {
    const onDone = vi.fn();
    render(<ResolutionReveal turn={turn} players={players} onDone={onDone} />);
    const steps = buildSteps(turn, players);

    expect(screen.getByText('嵐')).toBeTruthy();
    const stepMs: Record<string, number> = { attack: 1100, hit: 900, miss: 700, eliminated: 1100 };
    for (const s of steps) {
      act(() => {
        vi.advanceTimersByTime(stepMs[s.kind] ?? 1100);
      });
    }
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('クリックで即座に onDone が呼ばれる', () => {
    const onDone = vi.fn();
    const { container } = render(
      <ResolutionReveal turn={turn} players={players} onDone={onDone} />,
    );
    const overlay = container.querySelector('.reveal-overlay');
    expect(overlay).toBeTruthy();
    act(() => {
      overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
