import { useState } from 'react';
import { api } from '../api.js';
import { useGame } from '../store.js';

export function SubmitPanel() {
  const { pub, priv } = useGame();
  const n = pub?.config.conceptsPerPlayer ?? 5;
  const [values, setValues] = useState<string[]>(() => Array.from({ length: n }, () => ''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitted = priv?.myConcepts !== null && priv?.myConcepts !== undefined;
  const me = pub?.players.find((p) => p.seat === priv?.seat);

  if (me && !me.alive) return <p className="notice section">脱落しました。観戦中です</p>;

  if (submitted) {
    return (
      <div className="section">
        <span className="label">提出済み — 採点を待っています</span>
        <p>{priv?.myConcepts?.join('、')}</p>
      </div>
    );
  }

  const submit = async (): Promise<void> => {
    const cleaned = values.map((v) => v.trim());
    if (cleaned.some((v) => !v)) {
      setError(`概念を ${n} 個すべて入力してください`);
      return;
    }
    if (new Set(cleaned).size !== cleaned.length) {
      setError('同じ概念は使えません');
      return;
    }
    setBusy(true);
    setError('');
    const r = await api.submitConcepts(cleaned);
    if (!r.ok) {
      setError(r.message);
      setBusy(false);
    }
  };

  return (
    <div className="section">
      <span className="label">テーマと「中距離」の概念を {n} 個（非公開）</span>
      {values.map((v, i) => (
        <div className="field" key={i}>
          <input
            className="input"
            placeholder={`概念 ${i + 1}`}
            value={v}
            maxLength={20}
            onChange={(e) =>
              setValues((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
            }
          />
        </div>
      ))}
      <p className="error" role="alert">
        {error}
      </p>
      <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
        提出
      </button>
    </div>
  );
}
