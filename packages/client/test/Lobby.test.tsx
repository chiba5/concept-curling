import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSoloRoom = vi.fn();
const startSolo = vi.fn();
const navigate = vi.fn();
vi.mock('../src/api.js', async () => {
  const actual = await vi.importActual<typeof import('../src/api.js')>('../src/api.js');
  return { ...actual, api: { ...actual.api, createSoloRoom, startSolo } };
});
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const { Lobby } = await import('../src/pages/Lobby.js');

describe('Lobby ソロ導線', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  it('名前未入力ならエラーを出して送信しない', async () => {
    render(
      <MemoryRouter>
        <Lobby />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('ソロで試す'));
    expect(await screen.findByText('名前を入力してください')).toBeTruthy();
    expect(createSoloRoom).not.toHaveBeenCalled();
  });
  it('成功時は token を保存し /room/:id へ遷移する', async () => {
    createSoloRoom.mockResolvedValue({
      ok: true,
      data: { roomId: 'AB12CD', seat: 1, playerToken: 'tok-1' },
    });
    startSolo.mockResolvedValue({ ok: true });
    render(
      <MemoryRouter>
        <Lobby />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByPlaceholderText('名前'), { target: { value: 'アリス' } });
    fireEvent.click(screen.getByText('ソロで試す'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/room/AB12CD'));
    expect(localStorage.getItem('cc:token:AB12CD')).toBe('tok-1');
    expect(startSolo).toHaveBeenCalled();
  });
  it('サーバエラーは message を表示する', async () => {
    createSoloRoom.mockResolvedValue({ ok: false, code: 'internal', message: 'サーバエラー' });
    render(
      <MemoryRouter>
        <Lobby />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByPlaceholderText('名前'), { target: { value: 'アリス' } });
    fireEvent.click(screen.getByText('ソロで試す'));
    expect(await screen.findByText('サーバエラー')).toBeTruthy();
  });
});
