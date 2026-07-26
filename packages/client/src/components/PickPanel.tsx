import { useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../store.js';

export function PickPanel() {
  const { pub, priv } = useGame();
  const [selected, setSelected] = useState<number[]>([]);
  const [secret, setSecret] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const maxLives = pub?.config.maxLives ?? 3;
  const limit = pub?.config.pickMinTotal ?? 50;
  const allSecret = pub?.config.allSecret ?? true;
  const candidates = priv?.candidates ?? [];
  const me = pub?.players.find((p) => p.seat === priv?.seat);
  const picked = me?.ready ?? false;

  if (me && !me.alive)
    return <p className="notice section">選べる候補がなく、即敗北となりました……</p>;
  if (!candidates.length) return <p className="loading section">採点中……</p>;
  if (picked) return <p className="notice section">選抜済み — 他のプレイヤーを待っています</p>;

  const toggle = (i: number): void => {
    setSelected((prev) => {
      if (prev.includes(i)) {
        if (secret === i) setSecret(null);
        return prev.filter((x) => x !== i);
      }
      if (prev.length >= maxLives) return prev;
      return [...prev, i].sort((a, b) => a - b);
    });
  };

  const confirm = async (): Promise<void> => {
    if (!selected.length) {
      setError('ライフを 1 つ以上選んでください');
      return;
    }
    let secretIndexes: number[];
    if (allSecret) {
      secretIndexes = selected;
    } else {
      if (secret === null || !selected.includes(secret)) {
        setError('SECRET を選抜の中から 1 つ指定してください');
        return;
      }
      secretIndexes = [secret];
    }
    setBusy(true);
    setError('');
    const r = await api.pickLives({ selectedIndices: selected, secretIndexes });
    if (!r.ok) {
      setError(r.message);
      setBusy(false);
    }
  };

  return (
    <div className="section">
      <span className="label">
        {allSecret
          ? `合計 ${limit} 以上から最大 ${maxLives} 個をライフに（すべて SECRET）`
          : `合計 ${limit} 以上から最大 ${maxLives} 個をライフに。うち 1 つを「秘」に`}
      </span>
      {candidates.map((c, i) => (
        <div className="cand" key={i}>
          <input
            type="checkbox"
            checked={selected.includes(i)}
            disabled={!c.pickable || (!selected.includes(i) && selected.length >= maxLives)}
            onChange={() => toggle(i)}
            aria-label={`${c.concept} を選ぶ`}
          />
          <span className={`word${c.pickable ? '' : ' pickable-no'}`}>{c.concept}</span>
          <span className="num num-big">{c.total}</span>
          {allSecret ? null : (
            <label>
              秘
              <input
                type="radio"
                name="secret"
                checked={secret === i}
                disabled={!selected.includes(i)}
                onChange={() => setSecret(i)}
                aria-label={`${c.concept} を SECRET に`}
              />
            </label>
          )}
          <span className="why">
            {c.scores.map((s, j) => (
              <span key={j}>
                {j > 0 ? ' ／ ' : ''}
                {pub?.themes[j] ?? ''} {s}（<span>{c.reasons[j] ?? ''}</span>）
              </span>
            ))}
          </span>
        </div>
      ))}
      <p className="error" role="alert">
        {error}
      </p>
      <button className="btn btn-primary" onClick={() => void confirm()} disabled={busy}>
        この構成で確定
      </button>
    </div>
  );
}
