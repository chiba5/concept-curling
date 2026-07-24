import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CONFIG_LIMITS, DEFAULT_CONFIG, suggestedPickMinTotal } from '@concept-curling/shared';
import { api, session } from '../api.js';
import { Frame } from '../components/Frame.js';

export function Lobby() {
  const navigate = useNavigate();
  const [name, setName] = useState(session.getName());
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // ルーム設定（可変ルール）
  const [playerCount, setPlayerCount] = useState(DEFAULT_CONFIG.playerCount);
  const [conceptsPerPlayer, setConceptsPerPlayer] = useState(DEFAULT_CONFIG.conceptsPerPlayer);
  const [maxLives, setMaxLives] = useState(DEFAULT_CONFIG.maxLives);
  const [themeCount, setThemeCount] = useState(DEFAULT_CONFIG.themes.count);
  const [pickMinTotal, setPickMinTotal] = useState(DEFAULT_CONFIG.pickMinTotal);
  const [destroyThreshold, setDestroyThreshold] = useState(DEFAULT_CONFIG.destroyThreshold);
  const [allSecret, setAllSecret] = useState(DEFAULT_CONFIG.allSecret);
  const [showConfig, setShowConfig] = useState(false);

  const requireName = (): string | null => {
    const n = name.trim();
    if (!n) {
      setError('名前を入力してください');
      return null;
    }
    session.saveName(n);
    return n;
  };

  const enterRoom = (roomId: string, token: string): void => {
    session.saveToken(roomId, token);
    navigate(`/room/${roomId}`);
  };

  const solo = async (): Promise<void> => {
    const n = requireName();
    if (!n || busy) return;
    setBusy(true);
    setError('');
    const r = await api.createSoloRoom(n);
    if (!r.ok || !r.data) {
      setError(r.ok ? 'サーバ応答が不正です' : r.message);
      setBusy(false);
      return;
    }
    const started = await api.startSolo();
    if (!started.ok) {
      setError(started.message);
      setBusy(false);
      return;
    }
    enterRoom(r.data.roomId, r.data.playerToken);
  };

  const create = async (): Promise<void> => {
    const n = requireName();
    if (!n || busy) return;
    setBusy(true);
    setError('');
    const r = await api.createRoom({
      name: n,
      config: {
        ...DEFAULT_CONFIG,
        playerCount,
        conceptsPerPlayer,
        maxLives: Math.min(maxLives, conceptsPerPlayer - 1),
        pickMinTotal,
        destroyThreshold,
        allSecret,
        themes: { count: themeCount, mode: 'llm' },
      },
    });
    if (!r.ok || !r.data) {
      setError(r.ok ? 'サーバ応答が不正です' : r.message);
      setBusy(false);
      return;
    }
    enterRoom(r.data.roomId, r.data.playerToken);
  };

  const join = async (): Promise<void> => {
    const n = requireName();
    if (!n || busy) return;
    if (!code.trim()) {
      setError('ルームコードを入力してください');
      return;
    }
    setBusy(true);
    setError('');
    const r = await api.joinRoom(code, n);
    if (!r.ok || !r.data) {
      setError(r.ok ? 'サーバ応答が不正です' : r.message);
      setBusy(false);
      return;
    }
    enterRoom(r.data.roomId, r.data.playerToken);
  };

  const num = (v: string): number => Number.parseInt(v, 10);

  return (
    <Frame title="ロビー">
      <h1 className="themes">概念カーリング</h1>
      <p className="notice" style={{ textAlign: 'center' }}>
        AI が概念のあいだの「遠さ」を採点する、ことばの対戦ゲーム
      </p>

      <div className="section">
        <span className="label">あなたの名前</span>
        <input
          className="input"
          placeholder="名前"
          value={name}
          maxLength={12}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="lobby-actions section">
        <div>
          <span className="label">ひとりで</span>
          <button className="btn btn-primary" onClick={() => void solo()} disabled={busy}>
            ソロで試す
          </button>
          <p className="notice">CPU 2 体との 3 人戦がすぐ始まります</p>
        </div>
        <div>
          <span className="label">みんなで</span>
          <p>
            <button className="btn" onClick={() => setShowConfig((v) => !v)} disabled={busy}>
              ルームを作る
            </button>
          </p>
          {showConfig ? (
            <div className="field">
              <label className="label">
                人数 {playerCount}
                <input
                  type="range"
                  min={CONFIG_LIMITS.playerCount.min}
                  max={CONFIG_LIMITS.playerCount.max}
                  value={playerCount}
                  onChange={(e) => setPlayerCount(num(e.target.value))}
                />
              </label>
              <label className="label">
                提出概念数 {conceptsPerPlayer}
                <input
                  type="range"
                  min={CONFIG_LIMITS.conceptsPerPlayer.min}
                  max={CONFIG_LIMITS.conceptsPerPlayer.max}
                  value={conceptsPerPlayer}
                  onChange={(e) => setConceptsPerPlayer(num(e.target.value))}
                />
              </label>
              <label className="label">
                最大ライフ {Math.min(maxLives, conceptsPerPlayer - 1)}
                <input
                  type="range"
                  min={1}
                  max={conceptsPerPlayer - 1}
                  value={Math.min(maxLives, conceptsPerPlayer - 1)}
                  onChange={(e) => setMaxLives(num(e.target.value))}
                />
              </label>
              <label className="label">
                テーマ数 {themeCount}
                <input
                  type="range"
                  min={CONFIG_LIMITS.themesCount.min}
                  max={CONFIG_LIMITS.themesCount.max}
                  value={themeCount}
                  onChange={(e) => {
                    const c = num(e.target.value);
                    setThemeCount(c);
                    setPickMinTotal(suggestedPickMinTotal(c));
                  }}
                />
              </label>
              <label className="label">
                選抜下限（合計） {pickMinTotal}
                <input
                  type="range"
                  min={0}
                  max={themeCount * 100}
                  step={5}
                  value={pickMinTotal}
                  onChange={(e) => setPickMinTotal(num(e.target.value))}
                />
              </label>
              <label className="label">
                破壊閾値（関連度がこれを超えたら破壊） {destroyThreshold}
                <input
                  type="range"
                  min={30}
                  max={90}
                  value={destroyThreshold}
                  onChange={(e) => setDestroyThreshold(num(e.target.value))}
                />
              </label>
              <label className="label">
                <input
                  type="checkbox"
                  checked={allSecret}
                  onChange={(e) => setAllSecret(e.target.checked)}
                />{' '}
                全ライフを SECRET にする
              </label>
              <button className="btn btn-primary" onClick={() => void create()} disabled={busy}>
                この設定で作成
              </button>
            </div>
          ) : null}
          <div className="field" style={{ marginTop: 'var(--space)' }}>
            <span className="label">コードで参加</span>
            <input
              className="input"
              placeholder="ルームコード（例: AB12CD）"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button
              className="btn"
              onClick={() => void join()}
              disabled={busy}
              style={{ marginTop: 8 }}
            >
              参加
            </button>
          </div>
        </div>
      </div>

      <p className="error" role="alert">
        {error}
      </p>

      <div className="section rules">
        <span className="label">ルール（30 秒で読める版）</span>
        <ol>
          <li>
            2 つのテーマが出ます。各自、テーマと「深すぎず浅すぎない」概念を 5 つ非公開で出します
          </li>
          <li>
            AI が各概念とテーマの関連度を 0〜100 で採点（0=無関係、100=完全一致）。合計が下限以上の
            概念だけをライフにできます（最大 3 つ、既定では全部が相手に見えない SECRET）
          </li>
          <li>
            全員同時に攻撃概念を 1 つ出します。攻撃と相手ライフの関連度が 50
            を超えたら破壊。遠すぎる攻撃は届きません
          </li>
          <li>ライフが尽きたら脱落。最後まで残った人の勝ちです</li>
        </ol>
      </div>
    </Frame>
  );
}
