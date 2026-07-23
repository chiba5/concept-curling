import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import type { PrivateView, PublicState } from '@concept-curling/shared';
import { getSocket } from './socket.js';

interface GameData {
  connected: boolean;
  pub: PublicState | null;
  priv: PrivateView | null;
}

type Action =
  | { type: 'state'; pub: PublicState }
  | { type: 'private'; priv: PrivateView }
  | { type: 'connected'; connected: boolean }
  | { type: 'clear' };

function reducer(s: GameData, a: Action): GameData {
  switch (a.type) {
    case 'state':
      return { ...s, pub: a.pub };
    case 'private':
      return { ...s, priv: a.priv };
    case 'connected':
      return { ...s, connected: a.connected };
    case 'clear':
      return { ...s, pub: null, priv: null };
  }
}

interface GameContextValue extends GameData {
  clear: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const socket = getSocket();
  const [data, dispatch] = useReducer(reducer, {
    connected: socket.connected,
    pub: null,
    priv: null,
  });

  useEffect(() => {
    const onState = (pub: PublicState) => dispatch({ type: 'state', pub });
    const onPrivate = (priv: PrivateView) => dispatch({ type: 'private', priv });
    const onConnect = () => dispatch({ type: 'connected', connected: true });
    const onDisconnect = () => dispatch({ type: 'connected', connected: false });
    socket.on('state', onState);
    socket.on('private', onPrivate);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('state', onState);
      socket.off('private', onPrivate);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  return (
    <GameContext.Provider value={{ ...data, clear: () => dispatch({ type: 'clear' }) }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame(): GameContextValue {
  const v = useContext(GameContext);
  if (!v) throw new Error('useGame は GameProvider 内でのみ使用可能');
  return v;
}
