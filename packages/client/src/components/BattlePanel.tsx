import { useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../store.js';

export function BattlePanel() {
  const { pub, priv } = useGame();
  const [concept, setConcept] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const me = pub?.players.find((p) => p.seat === priv?.seat);
  const destroyThreshold = pub?.config.destroyThreshold ?? 70;

  if (me && !me.alive) return <p className="notice section">脱落しました。観戦中です</p>;
  if (priv?.attackSubmitted)
    return <p className="notice section">攻撃提出済み — 全員の提出で判定します</p>;

  const submit = async (): Promise<void> => {
    if (busy) return;
    const t = concept.trim();
    if (!t) {
      setError('攻撃概念を入力してください');
      return;
    }
    setBusy(true);
    setError('');
    const r = await api.attack(t);
    if (!r.ok) {
      setError(r.message);
      setBusy(false);
    } else {
      setConcept('');
      setBusy(false);
    }
  };

  return (
    <div className="section">
      <span className="label">
        攻撃概念 — 相手ライフとの関連度が {destroyThreshold} 以上なら破壊
      </span>
      <div className="field">
        <input
          className="input"
          placeholder="ことばを置く"
          value={concept}
          maxLength={20}
          onChange={(e) => setConcept(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
      </div>
      <p className="error" role="alert">
        {error}
      </p>
      <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
        投
      </button>
      {priv?.myLives ? (
        <p className="notice">
          自分のライフ:{' '}
          {[
            ...priv.myLives.open,
            ...priv.myLives.secrets.filter((s) => !s.destroyed).map((s) => `秘「${s.concept}」`),
          ].join('、')}
          （自分の攻撃は自分のライフにも当たります）
        </p>
      ) : null}
    </div>
  );
}
