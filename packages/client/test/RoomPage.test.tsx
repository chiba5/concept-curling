import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Ack, RoomJoined } from '@concept-curling/shared';

type Handler = (...args: unknown[]) => void;
const handlers = new Map<string, Handler>();
const emit = vi.fn((ev: string, ...rest: unknown[]): void => {
  const cb = rest[rest.length - 1] as ((res: Ack<RoomJoined>) => void) | undefined;
  if (ev === 'room:join' && typeof cb === 'function') {
    cb({ ok: true, data: { roomId: 'AB12CD', seat: 1, playerToken: 'tok-1' } });
  }
});
vi.mock('../src/socket.js', () => ({
  getSocket: () => ({
    on: (ev: string, fn: Handler) => handlers.set(ev, fn),
    off: (ev: string) => handlers.delete(ev),
    emit,
    get connected() {
      return true;
    },
  }),
}));

const { GameProvider } = await import('../src/store.js');
const { RoomPage } = await import('../src/pages/RoomPage.js');

const joinCallCount = (): number => emit.mock.calls.filter((c) => c[0] === 'room:join').length;

describe('RoomPage — トランスポート再接続時の再 join', () => {
  beforeEach(() => {
    emit.mockClear();
    handlers.clear();
    localStorage.clear();
    localStorage.setItem('cc:name', 'アリス');
  });

  it('connected が false→true になると同じ名前で room:join を再送する', async () => {
    render(
      <MemoryRouter initialEntries={['/room/AB12CD']}>
        <GameProvider>
          <Routes>
            <Route path="/room/:roomId" element={<RoomPage />} />
          </Routes>
        </GameProvider>
      </MemoryRouter>,
    );

    // マウント時の初回 join（room:join emit 自体は同期発火）
    expect(joinCallCount()).toBe(1);
    // join の Promise 解決（joinState → 'joined'）を待つ
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // トランスポート切断→再接続を模す
    act(() => {
      handlers.get('disconnect')?.();
    });
    act(() => {
      handlers.get('connect')?.();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(joinCallCount()).toBe(2);
  });

  it('joinState が joined でなければ再接続しても再 join しない（need-name 中の連打防止）', async () => {
    localStorage.removeItem('cc:name'); // need-name 状態のまま留まる
    render(
      <MemoryRouter initialEntries={['/room/AB12CD']}>
        <GameProvider>
          <Routes>
            <Route path="/room/:roomId" element={<RoomPage />} />
          </Routes>
        </GameProvider>
      </MemoryRouter>,
    );
    expect(joinCallCount()).toBe(0);

    act(() => {
      handlers.get('disconnect')?.();
    });
    act(() => {
      handlers.get('connect')?.();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(joinCallCount()).toBe(0);
  });
});
