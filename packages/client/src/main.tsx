import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import { GameProvider } from './store.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <GameProvider>
        <App />
      </GameProvider>
    </BrowserRouter>
  </StrictMode>,
);
