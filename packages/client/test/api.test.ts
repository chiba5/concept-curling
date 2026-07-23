import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ack } from '@concept-curling/shared';

const emit = vi.fn();
vi.mock('../src/socket.js', () => ({
  getSocket: () => ({ emit }),
}));

const { api, session } = await import('../src/api.js');

describe('api.emit ラッパ', () => {
  beforeEach(() => {
    emit.mockReset();
    localStorage.clear();
  });
  it('ack を Promise で返す', async () => {
    emit.mockImplementation((_ev: string, _p: unknown, cb: (r: Ack) => void) => cb({ ok: true }));
    await expect(api.submitConcepts(['灯台'])).resolves.toEqual({ ok: true });
    expect(emit).toHaveBeenCalledWith(
      'game:submitConcepts',
      { concepts: ['灯台'] },
      expect.any(Function),
    );
  });
  it('payload なしイベントは (event, cb) 形式で送る', async () => {
    emit.mockImplementation((_ev: string, cb: (r: Ack) => void) => cb({ ok: true }));
    await expect(api.startSolo()).resolves.toEqual({ ok: true });
    expect(emit).toHaveBeenCalledWith('room:start', expect.any(Function));
  });
  it('タイムアウト時は ok:false code:timeout を返す', async () => {
    vi.useFakeTimers();
    emit.mockImplementation(() => undefined); // ack が来ない
    const p = api.leaveRoom();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(p).resolves.toEqual({
      ok: false,
      code: 'timeout',
      message: 'サーバ応答がありません',
    });
    vi.useRealTimers();
  });
});

describe('session', () => {
  it('roomId ごとに playerToken を保存・取得・削除できる', () => {
    session.saveToken('AB12CD', 'token-1');
    expect(session.getToken('AB12CD')).toBe('token-1');
    expect(session.getToken('OTHER1')).toBeNull();
    session.clearToken('AB12CD');
    expect(session.getToken('AB12CD')).toBeNull();
  });
  it('プレイヤー名を保存・取得できる', () => {
    expect(session.getName()).toBe('');
    session.saveName('アリス');
    expect(session.getName()).toBe('アリス');
  });
});
