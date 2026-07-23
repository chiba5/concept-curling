import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App.js';

describe('App', () => {
  it('タイトルを表示する', () => {
    render(<App />);
    expect(screen.getByText('概念カーリング')).toBeTruthy();
  });
});
