import { Navigate, Route, Routes } from 'react-router-dom';
import { CabinetPage, MainPage, TracksPage } from './pages';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/cabinet" element={<CabinetPage />} />
      <Route path="/tracks" element={<TracksPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
