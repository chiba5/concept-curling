import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/socket.js', () => ({
  getSocket: () => ({
    on: () => undefined,
    off: () => undefined,
    connected: true,
  }),
}));

const { App } = await import('../src/App.js');
const { GameProvider } = await import('../src/store.js');

describe('App', () => {
  it('タイトルを表示する', () => {
    render(
      <MemoryRouter>
        <GameProvider>
          <App />
        </GameProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: '概念カーリング' })).toBeTruthy();
  });
});
