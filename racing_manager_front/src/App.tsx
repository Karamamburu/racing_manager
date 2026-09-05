import { Navigate, Route, Routes } from 'react-router-dom';
import { usePersonalQuery } from './features/auth/usePersonalQuery';
import { CabinetPage, EventPage, MainPage, TrackPage, TracksPage } from './pages';

export default function App() {
  usePersonalQuery();

  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/cabinet" element={<CabinetPage />} />
      <Route path="/tracks" element={<TracksPage />} />
      <Route path="/tracks/:id" element={<TrackPage />} />
      <Route path="/events/:id" element={<EventPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
