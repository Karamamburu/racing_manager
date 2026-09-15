import { Navigate, Route, Routes } from 'react-router-dom';
import {
  CabinetPage,
  CalendarPage,
  EventPage,
  MainPage,
  PolicyDocumentPage,
  PolicyPage,
  TrackPage,
  TracksPage,
} from './pages';
import { CookieConsentBanner } from './shared/cookieConsent';

export default function App() {
  return (
    <>
      <CookieConsentBanner />
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/cabinet" element={<CabinetPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/tracks" element={<TracksPage />} />
        <Route path="/tracks/:id" element={<TrackPage />} />
        <Route path="/events/:id" element={<EventPage />} />
        <Route path="/policy" element={<PolicyPage />} />
        <Route path="/policy/:slug" element={<PolicyDocumentPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
