import { Navigate, Route, Routes } from 'react-router-dom';
import { MainPage } from './pages/MainPage';
import { CabinetPage } from './pages/CabinetPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/cabinet" element={<CabinetPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
