import { useEffect, useState } from 'react';
import type { PublicPlayer } from '@concept-curling/shared';

function GraceCountdown({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <span className="grace">CPU 代打まで {left} 秒</span>;
}

export function PlayerStrip({
  players,
  mySeat,
}: {
  players: PublicPlayer[];
  mySeat: number | null;
}) {
  return (
    <div className="players">
      {players.map((p) => (
        <div
          key={p.seat}
          className={`player${p.seat === mySeat ? ' me' : ''}${p.alive ? '' : ' dead'}`}
        >
          <div className="name">
            <span>{p.name}</span>
            {p.ready && p.alive ? <span className="badge-ready">済</span> : null}
          </div>
          <div className="life">
            {p.livesPublic.map((c) => (
              <span key={c}>{c} </span>
            ))}
            {p.hasSecret ? <span className="secret-mark">秘</span> : null}
            {!p.alive ? <span>脱落</span> : null}
          </div>
          <div className="chips">
            {p.controller === 'cpu' ? <span>CPU</span> : null}
            {p.secretRevealed ? <span>公開: {p.secretRevealed}</span> : null}
            {p.graceDeadline !== null ? <GraceCountdown deadline={p.graceDeadline} /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
