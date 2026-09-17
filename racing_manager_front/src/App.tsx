import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Spin } from 'antd';
import {
  CabinetPage,
  CalendarPage,
  EventPage,
  MainPage,
  NewsArticlePage,
  NewsPage,
  PolicyDocumentPage,
  PolicyPage,
  TrackPage,
  TracksPage,
} from './pages';
import { CookieConsentBanner } from './shared/cookieConsent';

const NewsEditorPage = lazy(() =>
  import('./pages/NewsPage/NewsEditorPage').then((module) => ({
    default: module.NewsEditorPage,
  })),
);

function NewsEditorRoute() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      }
    >
      <NewsEditorPage />
    </Suspense>
  );
}

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
        <Route path="/news" element={<NewsPage />} />
        <Route path="/news/new" element={<NewsEditorRoute />} />
        <Route path="/news/:id/edit" element={<NewsEditorRoute />} />
        <Route path="/news/:id" element={<NewsArticlePage />} />
        <Route path="/events/:id" element={<EventPage />} />
        <Route path="/policy" element={<PolicyPage />} />
        <Route path="/policy/:slug" element={<PolicyDocumentPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
