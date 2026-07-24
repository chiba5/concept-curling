import { api } from '../api.js';
import { useGame } from '../store.js';

export function FinishedPanel() {
  const { pub, priv } = useGame();
  if (!pub) return null;
  const winner = pub.players.find((p) => p.seat === pub.winnerSeat);
  const isHost = priv?.seat === pub.hostSeat;

  return (
    <div className="section">
      <h2 className="themes winner">
        {winner
          ? priv?.seat === pub.winnerSeat
            ? 'あなたの勝利'
            : `${winner.name} の勝利`
          : '相打ち — 勝者なし'}
      </h2>
      <span className="label">全 SECRET 公開</span>
      <div className="players">
        {pub.players.map((p) => (
          <div key={p.seat} className="player">
            <div className="name">
              <span>{p.name}</span>
            </div>
            <div className="life">
              {p.secretRevealed ? (
                <span className="secret-mark">秘 {p.secretRevealed}</span>
              ) : (
                <span className="chips">SECRET なし</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {isHost ? (
        <button className="btn btn-primary" onClick={() => void api.resetGame()}>
          もう一戦
        </button>
      ) : (
        <p className="notice">ホストが再戦を開始できます</p>
      )}
    </div>
  );
}
