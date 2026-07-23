import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, session } from '../api.js';
import { Frame } from '../components/Frame.js';
import { PlayerStrip } from '../components/PlayerStrip.js';
import { SubmitPanel } from '../components/SubmitPanel.js';
import { PickPanel } from '../components/PickPanel.js';
import { BattlePanel } from '../components/BattlePanel.js';
import { TurnLog } from '../components/TurnLog.js';
import { FinishedPanel } from '../components/FinishedPanel.js';
import { useGame } from '../store.js';

type JoinState = 'connecting' | 'joined' | 'need-name' | 'error';

export function RoomPage() {
  const { roomId = '' } = useParams();
  const navigate = useNavigate();
  const { pub, priv, clear } = useGame();
  const [joinState, setJoinState] = useState<JoinState>('connecting');
  const [error, setError] = useState('');
  const [nameInput, setNameInput] = useState(session.getName());
  const joinedRoomRef = useRef<string | null>(null);

  const join = async (name: string): Promise<void> => {
    const token = session.getToken(roomId) ?? undefined;
    const r = await api.joinRoom(roomId, name, token);
    if (r.ok && r.data) {
      session.saveToken(roomId, r.data.playerToken);
      session.saveName(name);
      setJoinState('joined');
      return;
    }
    if (!r.ok && r.code === 'room_full') {
      setError('このルームは満席です');
      setJoinState('error');
      return;
    }
    setError(r.ok ? 'サーバ応答が不正です' : r.message);
    setJoinState('error');
  };

  useEffect(() => {
    if (joinedRoomRef.current === roomId) return; // StrictMode の二重実行・同一ルーム再実行を抑止
    joinedRoomRef.current = roomId;
    const name = session.getName();
    if (!name) {
      setJoinState('need-name');
      return;
    }
    void join(name);
    // 依存は roomId のみ（join はマウント時 1 回で良い）
  }, [roomId]);

  const leave = async (): Promise<void> => {
    await api.leaveRoom();
    session.clearToken(roomId);
    clear();
    navigate('/');
  };

  const mySeat = priv?.seat ?? null;
  const isHost = pub !== null && mySeat === pub.hostSeat;
  const sub = useMemo(() => {
    if (!pub) return roomId;
    const phaseLabel: Record<string, string> = {
      waiting: '待機中',
      theming: '主題生成中',
      submitting: '概念提出',
      picking: 'ライフ選抜',
      battle: `第${pub.round}回合`,
      finished: '決着',
    };
    return `${roomId} — ${phaseLabel[pub.phase] ?? pub.phase}`;
  }, [pub, roomId]);

  if (joinState === 'need-name') {
    return (
      <Frame title="参加">
        <div className="section field">
          <span className="label">あなたの名前</span>
          <input
            className="input"
            placeholder="名前"
            value={nameInput}
            maxLength={12}
            onChange={(e) => setNameInput(e.target.value)}
          />
          <button
            className="btn btn-primary"
            style={{ marginTop: 12 }}
            onClick={() => {
              if (nameInput.trim()) void join(nameInput.trim());
            }}
          >
            このルームに参加
          </button>
        </div>
      </Frame>
    );
  }
  if (joinState === 'error') {
    return (
      <Frame title="エラー">
        <p className="error" role="alert">
          {error}
        </p>
        <button className="btn" onClick={() => void navigate('/')}>
          ロビーへ戻る
        </button>
      </Frame>
    );
  }
  if (!pub || joinState === 'connecting') {
    return (
      <Frame title="接続中">
        <p className="loading">接続しています……（初回は目覚めに 20 秒ほどかかることがあります）</p>
      </Frame>
    );
  }

  return (
    <Frame title="ゲーム" sub={sub}>
      {pub.themes.length ? (
        <p className="themes">
          {pub.themes.map((t, i) => (
            <span key={t}>
              {i > 0 ? <span className="x">×</span> : null}
              {t}
            </span>
          ))}
        </p>
      ) : null}

      <PlayerStrip players={pub.players} mySeat={mySeat} />

      {pub.phase === 'waiting' ? (
        <div className="section">
          <span className="label">あと {pub.config.playerCount - pub.players.length} 人</span>
          <p className="notice">この URL を共有すると友人が参加できます</p>
          <p>
            <button
              className="btn"
              onClick={() => void navigator.clipboard.writeText(window.location.href)}
            >
              参加 URL をコピー
            </button>{' '}
            {isHost ? (
              <>
                <button className="btn" onClick={() => void api.addCpu()}>
                  CPU を 1 体追加
                </button>{' '}
                <button className="btn btn-primary" onClick={() => void api.startSolo()}>
                  残りを CPU で埋めて開始
                </button>
              </>
            ) : null}
          </p>
        </div>
      ) : null}
      {pub.phase === 'theming' ? <p className="loading">主題を練っています……</p> : null}
      {pub.phase === 'submitting' ? <SubmitPanel /> : null}
      {pub.phase === 'picking' ? <PickPanel /> : null}
      {pub.phase === 'battle' ? <BattlePanel /> : null}
      {pub.phase === 'finished' ? <FinishedPanel /> : null}

      {pub.turns.length ? (
        <div className="section">
          <span className="label">判定録</span>
          <TurnLog turns={pub.turns} players={pub.players} />
        </div>
      ) : null}

      <div className="section">
        <button className="btn" onClick={() => void leave()}>
          退室してロビーへ
        </button>
      </div>
    </Frame>
  );
}
