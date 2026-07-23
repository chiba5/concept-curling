import type { PublicPlayer, TurnRecord } from '@concept-curling/shared';

export function TurnLog({ turns, players }: { turns: TurnRecord[]; players: PublicPlayer[] }) {
  const nameOf = (seat: number): string =>
    players.find((p) => p.seat === seat)?.name ?? `席${seat}`;
  return (
    <div>
      {[...turns].reverse().map((turn) => (
        <div className="turn" key={turn.round}>
          <div className="turn-head">
            <span>第{turn.round}回合</span>
            <span className="notice">
              {turn.attacks.map((a) => nameOf(a.seat)).join('、')} が攻撃を提出
            </span>
          </div>
          <div className="turn-body">
            {turn.details.map((d, i) => (
              <div className="verdict" key={i}>
                <span className={`pair${d.destroyed ? ' destroyed' : ''}`}>
                  {d.atkConcept} → {d.targetLabel}
                  <span className="notice">（{nameOf(d.targetSeat)}）</span>
                </span>
                <span className={`score${d.destroyed ? ' destroyed-score' : ''}`}>{d.score}</span>
                <span className="why">
                  <span>{d.reason}</span>
                  {d.destroyed ? <span> — 破壊</span> : null}
                </span>
              </div>
            ))}
            {turn.eliminatedSeats.length ? (
              <p className="notice">{turn.eliminatedSeats.map(nameOf).join('、')} が脱落</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
