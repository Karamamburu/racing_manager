import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import App from './App';

// The route table is what this suite proves, so every page is a stub that only
// answers with its own name. None of them reads the network here.
vi.mock('./pages', () => ({
  CabinetPage: () => 'Кабинет',
  CalendarPage: () => 'Календарь',
  EventPage: () => 'Мероприятие',
  MainPage: () => 'Главная',
  NewsArticlePage: () => 'Новость',
  NewsPage: () => 'Новости',
  PolicyDocumentPage: () => 'Документ',
  PolicyPage: () => 'Политика',
  TrackPage: () => 'Трасса',
  TracksPage: () => 'Трассы',
}));

vi.mock('./pages/TimingPage/index', () => ({
  TimingPage: () => 'Хронометраж мероприятия',
}));

vi.mock('./shared/cookieConsent', () => ({
  CookieConsentBanner: () => null,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
});

describe('App timing route', () => {
  it('registers the lazy timing surface under the event path', async () => {
    renderAt('/events/event-1/timing');

    // The page is a lazy chunk: the first render is the Suspense fallback, so
    // the assertion waits for the resolved module (AD-9).
    expect(await screen.findByText('Хронометраж мероприятия')).not.toBeNull();
  });

  it('keeps the event page on the shorter event path', () => {
    renderAt('/events/event-1');

    expect(screen.getByText('Мероприятие')).not.toBeNull();
    expect(screen.queryByText('Хронометраж мероприятия')).toBeNull();
  });

  it('keeps the fallback redirect to the main page', async () => {
    renderAt('/no-such-route');

    expect(await screen.findByText('Главная')).not.toBeNull();
  });
});
