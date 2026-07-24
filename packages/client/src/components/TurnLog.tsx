import type { PublicPlayer, TurnDetail, TurnRecord } from '@concept-curling/shared';

interface Col {
  key: string;
  targetSeat: number;
  targetKind: 'normal' | 'secret';
  targetOrdinal: number;
  label: string; // SECRET は「秘N」、公開済みなら概念名
}

function colKey(targetSeat: number, targetOrdinal: number): string {
  return `${targetSeat}:${targetOrdinal}`;
}

function buildColumns(details: TurnDetail[]): Col[] {
  const cols = new Map<string, Col>();
  for (const d of details) {
    const key = colKey(d.targetSeat, d.targetOrdinal);
    const label =
      d.targetKind === 'secret' && d.targetLabel === 'SECRET'
        ? `秘${d.targetOrdinal + 1}`
        : d.targetLabel;
    const existing = cols.get(key);
    if (!existing) {
      cols.set(key, {
        key,
        targetSeat: d.targetSeat,
        targetKind: d.targetKind,
        targetOrdinal: d.targetOrdinal,
        label,
      });
    } else if (d.targetKind === 'secret' && d.targetLabel !== 'SECRET') {
      existing.label = d.targetLabel; // ターン中に公開されたら概念名で表示
    }
  }
  return [...cols.values()];
}

export function TurnLog({ turns, players }: { turns: TurnRecord[]; players: PublicPlayer[] }) {
  const nameOf = (seat: number): string =>
    players.find((p) => p.seat === seat)?.name ?? `席${seat}`;
  return (
    <div>
      {[...turns].reverse().map((turn) => {
        const cols = buildColumns(turn.details);
        const rows = turn.attacks;
        const cell = new Map<string, TurnDetail>();
        for (const d of turn.details) {
          cell.set(`${d.atkSeat}|${colKey(d.targetSeat, d.targetOrdinal)}`, d);
        }
        const destroyedRows = turn.details.filter((d) => d.destroyed);
        return (
          <div className="turn" key={turn.round}>
            <div className="turn-head">
              <span>第{turn.round}回合</span>
            </div>
            <div className="turn-body">
              <table className="table matrix">
                <thead>
                  <tr>
                    <th>攻撃 ＼ ライフ</th>
                    {cols.map((c) => (
                      <th key={c.key} className="num">
                        {c.label}
                        <span className="why">（{nameOf(c.targetSeat)}）</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((atk) => (
                    <tr key={atk.seat}>
                      <td>
                        {atk.concept}
                        <span className="why">（{nameOf(atk.seat)}）</span>
                      </td>
                      {cols.map((c) => {
                        const d = cell.get(`${atk.seat}|${c.key}`);
                        return (
                          <td key={c.key} className="num">
                            {d ? (
                              <span className={d.destroyed ? 'destroyed destroyed-score' : ''}>
                                {d.score}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {destroyedRows.map((d, i) => (
                <p className="why" key={i}>
                  {d.atkConcept} が {nameOf(d.targetSeat)} の「
                  {d.targetKind === 'secret' && d.targetLabel === 'SECRET' ? '秘' : d.targetLabel}
                  」を破壊 — {d.reason}
                </p>
              ))}
              {turn.reveals.length ? (
                <p className="why">
                  公開: {turn.reveals.map((r) => `${r.concept}（${nameOf(r.seat)}）`).join('、')}
                </p>
              ) : null}
              {turn.eliminatedSeats.length ? (
                <p className="notice">{turn.eliminatedSeats.map(nameOf).join('、')} が脱落</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
