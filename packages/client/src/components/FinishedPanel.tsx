import { api } from '../api.js';
import { useGame } from '../store.js';

export function FinishedPanel() {
  const { pub, priv } = useGame();
  if (!pub) return null;
  const winner = pub.players.find((p) => p.seat === pub.winnerSeat);
  const isHost = priv?.seat === pub.hostSeat;
  const outcome: 'win' | 'lose' | 'draw' =
    pub.winnerSeat === null ? 'draw' : priv?.seat === pub.winnerSeat ? 'win' : 'lose';

  return (
    <div className="section">
      {outcome === 'win' ? <Confetti /> : null}
      <div className="stamp-row">
        <span
          className={`stamp ${outcome === 'win' ? 'stamp-win' : 'stamp-lose'}${outcome === 'draw' ? ' stamp-long' : ''}`}
        >
          {outcome === 'win' ? '勝' : outcome === 'lose' ? '敗' : '相打'}
        </span>
      </div>
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

function Confetti() {
  const pieces = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((i) => (
        <i
          key={i}
          style={{
            left: `${(i * 41) % 100}%`,
            background:
              i % 3 === 0 ? 'var(--vermilion)' : i % 3 === 1 ? 'var(--ink)' : 'var(--rule)',
            ['--dur' as string]: `${2.2 + ((i * 7) % 10) / 6}s`,
            ['--delay' as string]: `${((i * 13) % 8) / 10}s`,
          }}
        />
      ))}
    </div>
  );
}
