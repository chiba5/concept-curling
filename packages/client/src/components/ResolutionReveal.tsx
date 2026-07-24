import { useEffect, useMemo, useState } from 'react';
import type { PublicPlayer, TurnRecord } from '@concept-curling/shared';

interface Step {
  kind: 'attack' | 'hit' | 'miss' | 'eliminated';
  text: string;
  sub?: string;
  score?: number;
}

export function buildSteps(turn: TurnRecord, players: PublicPlayer[]): Step[] {
  const nameOf = (seat: number) => players.find((p) => p.seat === seat)?.name ?? `席${seat}`;
  const steps: Step[] = [];
  for (const atk of turn.attacks) {
    steps.push({ kind: 'attack', text: atk.concept, sub: `${nameOf(atk.seat)} の攻撃` });
    const hits = turn.details.filter((d) => d.atkSeat === atk.seat && d.destroyed);
    if (hits.length === 0) {
      steps.push({ kind: 'miss', text: '不発' });
    } else {
      for (const d of hits) {
        steps.push({
          kind: 'hit',
          text: d.targetLabel === 'SECRET' ? '秘' : d.targetLabel,
          sub: `${nameOf(d.targetSeat)} のライフを破壊 — ${d.reason}`,
          score: d.score,
        });
      }
    }
  }
  if (turn.eliminatedSeats.length) {
    steps.push({ kind: 'eliminated', text: `${turn.eliminatedSeats.map(nameOf).join('、')} 脱落` });
  }
  return steps;
}

const STEP_MS: Record<Step['kind'], number> = {
  attack: 1100,
  hit: 900,
  miss: 700,
  eliminated: 1100,
};

export function ResolutionReveal({
  turn,
  players,
  onDone,
}: {
  turn: TurnRecord;
  players: PublicPlayer[];
  onDone: () => void;
}) {
  const steps = useMemo(() => buildSteps(turn, players), [turn, players]);
  const [index, setIndex] = useState(0);
  const step = steps[index];

  useEffect(() => {
    if (!step) {
      onDone();
      return;
    }
    const t = setTimeout(() => setIndex((i) => i + 1), STEP_MS[step.kind]);
    return () => clearTimeout(t);
  }, [index, step, onDone]);

  if (!step) return null;
  return (
    <div className="reveal-overlay" onClick={onDone} role="presentation">
      <div className="reveal-card" key={index}>
        {step.sub ? <span className="label">{step.sub}</span> : null}
        <span
          className={`reveal-main${step.kind === 'hit' ? ' destroyed destroyed-score' : ''}${step.kind === 'attack' ? ' reveal-stamp' : ''}`}
        >
          {step.text}
        </span>
        {step.score !== undefined ? (
          <span className="reveal-score">関連度 {step.score}</span>
        ) : null}
        <span className="notice reveal-skip">タップでスキップ</span>
      </div>
    </div>
  );
}
