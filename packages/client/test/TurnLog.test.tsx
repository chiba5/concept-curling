import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PublicPlayer, TurnRecord } from '@concept-curling/shared';
import { TurnLog } from '../src/components/TurnLog.js';

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
      score: 23,
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
      score: 88,
      reason: '別領域',
      destroyed: false,
    },
    {
      atkSeat: 1,
      atkConcept: '嵐',
      targetSeat: 1,
      targetKind: 'secret',
      targetOrdinal: 1,
      targetLabel: 'SECRET',
      score: 10,
      reason: '遠い',
      destroyed: false,
    },
  ],
  destroys: [{ seat: 2, kind: 'normal', concept: '風見鶏' }],
  reveals: [],
  eliminatedSeats: [],
};

describe('TurnLog', () => {
  it('マトリクスに攻撃・スコア・理由・破壊が表示され、SECRET は伏せられる', () => {
    const { container } = render(<TurnLog turns={[turn]} players={players} />);
    expect(screen.getAllByText(/嵐/).length).toBeGreaterThan(0);
    expect(screen.getByText('23')).toBeTruthy();
    expect(screen.getByText(/気象由来の近縁/)).toBeTruthy();
    expect(container.querySelector('table.matrix')).toBeTruthy();
    const headers = [...container.querySelectorAll('table.matrix th')].map((th) => th.textContent);
    expect(headers.some((h) => h?.includes('風見鶏'))).toBe(true);
  });
  it('同一席の複数 SECRET を targetOrdinal で区別した列にする', () => {
    const { container } = render(<TurnLog turns={[turn]} players={players} />);
    const headers = [...container.querySelectorAll('table.matrix th')].map((th) => th.textContent);
    expect(headers.some((h) => h?.includes('秘1'))).toBe(true);
    expect(headers.some((h) => h?.includes('秘2'))).toBe(true);
  });
  it('破壊された行に destroyed クラスが付く（朱の打ち消し線）', () => {
    const { container } = render(<TurnLog turns={[turn]} players={players} />);
    expect(container.querySelectorAll('.destroyed')).toHaveLength(1);
  });
});
