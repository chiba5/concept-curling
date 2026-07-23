import type { PublicPlayer, TurnRecord } from '@concept-curling/shared';

export function TurnLog({
  turns: _turns,
  players: _players,
}: {
  turns: TurnRecord[];
  players: PublicPlayer[];
}) {
  return <p className="notice">実装中</p>;
}
