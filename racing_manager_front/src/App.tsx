import { Navigate, Route, Routes } from 'react-router-dom';
import { CabinetPage, MainPage, TrackPage, TracksPage } from './pages';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/cabinet" element={<CabinetPage />} />
      <Route path="/tracks" element={<TracksPage />} />
      <Route path="/tracks/:id" element={<TrackPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
