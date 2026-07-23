import { Route, Routes } from 'react-router-dom';
import { Lobby } from './pages/Lobby.js';
import { RoomPage } from './pages/RoomPage.js';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Lobby />} />
      <Route path="/room/:roomId" element={<RoomPage />} />
    </Routes>
  );
}
