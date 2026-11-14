import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useSessionQuery } from '../../features/auth/useSessionQuery';
import { useClassCompetitionsQuery } from '../../features/class-competitions/useClassCompetitionsQuery';
import type { ClassCompetitionView } from '../../features/class-competitions/types';
import { categoryTitle } from '../../features/events/ageCategories';
import {
  categoryReadyToFinish,
  groupParticipants,
} from '../../features/events/protocolGroups';
import { filterProtocolGroups } from '../../features/events/protocolFilters';
import { useEventDetailsQuery } from '../../features/events/useEventDetailsQuery';
import type {
  AgeCategoryRef,
  AgeGroupId,
  AgeSplitRef,
  EventDetails,
  EventFormatRef,
  EventParticipant,
  StartResponse,
} from '../../shared/types/event';
import {
  AGE_SPLIT_BLOCKING_EVENT_STATUSES,
  EventPage,
  resolveAgeSplitGroupCounts,
  resolveAgeSplitSelection,
  type AgeSplitSelectionInput,
} from './index';
import type { AgeSplitCategory } from './components/AgeSplitModal';

vi.mock('../../features/auth/useSessionQuery', () => ({
  useSessionQuery: vi.fn(),
}));

vi.mock('../../features/events/useEventDetailsQuery', () => ({
  useEventDetailsQuery: vi.fn(),
  eventDetailsQueryKey: (id: string | undefined) => ['event', id ?? ''] as const,
}));

vi.mock('../../features/class-competitions/useClassCompetitionsQuery', () => ({
  useClassCompetitionsQuery: vi.fn(),
  classCompetitionsQueryKey: (id: string | undefined) =>
    ['class-competitions', id ?? ''] as const,
}));


const base: AgeSplitSelectionInput = {
  roles: ['ADMINISTRATOR'],
  eventStatus: 'PLANNED',
  bracketInProgress: false,
  hasStarts: true,
  rowCount: 3,
  startId: 'start-a',
  formatId: 1,
  gender: 'M',
  startLabel: 'Кубковая гонка — 10 км',
  formatName: '10 км',
};

const selection = {
  startId: 'start-a',
  formatId: 1,
  gender: 'M',
  startLabel: 'Кубковая гонка — 10 км',
  formatName: '10 км',
};

describe('EventPage «Возрастные категории» gating', () => {
  it('offers the control to an administrator on a category with rows', () => {
    expect(resolveAgeSplitSelection(base)).toEqual(selection);
  });

  it('offers the control to an organizer on a category with rows', () => {
    expect(
      resolveAgeSplitSelection({ ...base, roles: ['ORGANIZER'] }),
    ).toEqual(selection);
  });

  it('offers no control to any other role', () => {
    const otherRoles: (string[] | undefined)[] = [
      ['USER'],
      ['PARTICIPANT'],
      [],
      undefined,
    ];
    for (const roles of otherRoles) {
      expect(resolveAgeSplitSelection({ ...base, roles })).toBeNull();
    }
  });

  it('offers no control when the protocol category has no rows', () => {
    expect(resolveAgeSplitSelection({ ...base, rowCount: 0 })).toBeNull();
  });

  it('offers no control when the event has no starts', () => {
    expect(resolveAgeSplitSelection({ ...base, hasStarts: false })).toBeNull();
  });

  it('offers no control while a multi-stage race is in progress', () => {
    expect(
      resolveAgeSplitSelection({ ...base, bracketInProgress: true }),
    ).toBeNull();
  });

  it('offers no control for a format or gender that is not a protocol category', () => {
    expect(resolveAgeSplitSelection({ ...base, formatId: null })).toBeNull();
    expect(resolveAgeSplitSelection({ ...base, gender: '' })).toBeNull();
  });

  it('keeps the control on a finished event', () => {
    expect(AGE_SPLIT_BLOCKING_EVENT_STATUSES).toEqual([]);
    expect(
      resolveAgeSplitSelection({ ...base, eventStatus: 'FINISHED' }),
    ).toEqual(selection);
  });

  it('keeps the control on a cancelled event', () => {
    expect(
      resolveAgeSplitSelection({ ...base, eventStatus: 'CANCELLED' }),
    ).toEqual(selection);
  });
});

const formats: EventFormatRef[] = [
  { id: 1, code: '10K', name: '10 км', sortOrder: 1 },
];

const starts: StartResponse[] = [
  {
    id: 'start-a',
    purposeType: 'CUP_RACE',
    formatIds: [1],
    lapCount: 1,
    lapLengthMeters: 1000,
    displayName: null,
    sortOrder: 1,
    resolvedLabel: 'Кубковая гонка',
    legacyEffectiveDistanceM: null,
    displayedDistanceMeters: 1000,
  },
];

function category(
  number: number,
  groupIds: AgeGroupId[],
): AgeCategoryRef {
  return {
    id: `CATEGORY_${number}`,
    number,
    title: categoryTitle(number),
    subtitle: '',
    groupIds,
  };
}

const split: AgeSplitRef = {
  startId: 'start-a',
  formatId: 1,
  gender: 'M',
  enabled: true,
  categories: [category(1, ['AGE_24_40']), category(2, ['AGE_41_50'])],
};

function participant(
  overrides: Partial<EventParticipant> = {},
): EventParticipant {
  return {
    id: 'registration-1',
    enrollmentId: 'enrollment-1',
    startId: 'start-a',
    startLabel: 'Кубковая гонка',
    sortOrder: 0,
    enrollmentStatus: 'REGISTERED',
    userId: null,
    fullName: 'Иван Тестов',
    birthYear: 1990,
    gender: 'M',
    city: null,
    district: null,
    team: null,
    startNumber: 1,
    finishTimeMs: null,
    outcome: null,
    place: null,
    format: formats[0],
    laps: [],
    status: 'REGISTERED',
    isCupEligible: true,
    note: null,
    registeredAt: '2026-11-07T00:00:00.000Z',
    sectionId: 'CATEGORY_1',
    ...overrides,
  };
}

const rows: EventParticipant[] = [
  participant({
    id: 'row-young',
    fullName: 'Иван Молодой',
    sectionId: 'CATEGORY_1',
    startNumber: 1,
    outcome: 'FINISHED',
    finishTimeMs: 3_600_000,
    place: 1,
  }),
  participant({
    id: 'row-master',
    fullName: 'Иван Опытный',
    sectionId: 'CATEGORY_1',
    startNumber: 2,
    outcome: 'FINISHED',
    finishTimeMs: 3_700_000,
    place: 2,
  }),
  participant({
    id: 'row-hidden',
    fullName: 'Пётр Ветеранов',
    sectionId: 'CATEGORY_2',
    startNumber: 3,
  }),
];

const activeFilter = { query: 'молодой', cities: [], teams: [] };

describe('EventPage age sections under an active protocol filter', () => {
  const groups = groupParticipants(rows, formats, starts, [split]);

  it('hides the age categories whose rows are all filtered out', () => {
    const section = filterProtocolGroups(groups, activeFilter)[0].sections[0];

    expect(section.ageSections.map((item) => item.key)).toEqual([
      'CATEGORY_1',
    ]);
    expect(section.ageSections.map((item) => item.title)).toContain(
      categoryTitle(1),
    );
    expect(section.ageSections.map((item) => item.title)).not.toContain(
      categoryTitle(2),
    );
  });

  it('counts displayed rows instead of the full age-section rows', () => {
    const section = filterProtocolGroups(groups, activeFilter)[0].sections[0];
    const ageSection = section.ageSections[0];

    expect(ageSection.rows).toHaveLength(2);
    expect(ageSection.visibleRows).toHaveLength(1);
    expect(section.visibleRows).toHaveLength(1);
  });

  it('keeps the full protocol-category row set for category actions', () => {
    const section = filterProtocolGroups(groups, activeFilter)[0].sections[0];

    expect(section.rows.map((row) => row.id)).toEqual([
      'row-young',
      'row-master',
      'row-hidden',
    ]);
    // The row hidden by the filter has no result, so «Завершить гонку» stays
    // disabled; the visible subset alone would read as ready, which U-28
    // forbids for category-level actions.
    expect(categoryReadyToFinish(section.rows)).toBe(false);
    expect(categoryReadyToFinish(section.visibleRows)).toBe(true);
  });
});

const countsStarts: StartResponse[] = [
  starts[0],
  {
    ...starts[0],
    id: 'start-b',
    resolvedLabel: 'Кубковая гонка — вторая',
    sortOrder: 2,
  },
];

const countsRows: EventParticipant[] = [
  participant({
    id: 'a-24-primary',
    fullName: 'Иван Первый',
    ageGroupId: 'AGE_24_40',
  }),
  participant({
    id: 'a-24-secondary',
    fullName: 'Пётр Скрытый',
    ageGroupId: 'AGE_24_40',
  }),
  participant({
    id: 'a-41-primary',
    fullName: 'Иван Третий',
    ageGroupId: 'AGE_41_50',
  }),
  participant({
    id: 'b-24-primary',
    fullName: 'Иван Четвёртый',
    startId: 'start-b',
    ageGroupId: 'AGE_24_40',
  }),
];

const countsFilter = { query: 'иван', cities: [], teams: [] };

const categoryA: AgeSplitCategory = {
  startId: 'start-a',
  formatId: 1,
  gender: 'M',
  startLabel: 'Кубковая гонка',
  formatName: '10 км',
};

const categoryB: AgeSplitCategory = {
  ...categoryA,
  startId: 'start-b',
  startLabel: 'Кубковая гонка — вторая',
};

const zeroCounts: Record<AgeGroupId, number> = {
  AGE_LE_14: 0,
  AGE_15_16: 0,
  AGE_17_18: 0,
  AGE_19_20: 0,
  AGE_21_23: 0,
  AGE_24_40: 0,
  AGE_41_50: 0,
  AGE_51_60: 0,
  AGE_61_PLUS: 0,
};

describe('resolveAgeSplitGroupCounts', () => {
  const groups = groupParticipants(countsRows, formats, countsStarts, []);
  const filteredGroups = filterProtocolGroups(groups, countsFilter);

  it('builds a two-section fixture whose visible rows are a strict subset', () => {
    expect(filteredGroups[0].sections.map((section) => section.key)).toEqual([
      'start-a-1-M',
      'start-b-1-M',
    ]);
    expect(filteredGroups[0].sections[0].rows).toHaveLength(3);
    expect(filteredGroups[0].sections[0].visibleRows).toHaveLength(2);
    expect(filteredGroups[0].sections[1].rows).toHaveLength(1);
    expect(filteredGroups[0].sections[1].visibleRows).toHaveLength(1);
  });

  it('counts every row of the matching start × format × gender, not the filtered subset', () => {
    expect(resolveAgeSplitGroupCounts(filteredGroups, categoryA)).toEqual({
      ...zeroCounts,
      AGE_24_40: 2,
      AGE_41_50: 1,
    });
  });

  it('returns zero-filled keys for the nine base groups', () => {
    const counts = resolveAgeSplitGroupCounts(filteredGroups, categoryA);

    expect(Object.keys(counts)).toHaveLength(9);
    expect(counts).toEqual({
      ...zeroCounts,
      AGE_24_40: 2,
      AGE_41_50: 1,
    });
  });

  it('ignores the rows of every other protocol category', () => {
    expect(resolveAgeSplitGroupCounts(filteredGroups, categoryB)).toEqual({
      ...zeroCounts,
      AGE_24_40: 1,
    });
  });

  it('returns an empty record for a category with no matching section', () => {
    expect(resolveAgeSplitGroupCounts(filteredGroups, { ...categoryA, gender: 'F' })).toEqual({});
    expect(resolveAgeSplitGroupCounts(filteredGroups, { ...categoryA, formatId: 2 })).toEqual({});
    expect(resolveAgeSplitGroupCounts(filteredGroups, { ...categoryA, startId: 'start-z' })).toEqual({});
  });

  it('returns an empty record when no category is selected', () => {
    expect(resolveAgeSplitGroupCounts(filteredGroups, null)).toEqual({});
  });
});

const TIMING_SURFACE_TEXT = 'Хронометраж мероприятия';

function eventDetails(
  registrations: EventParticipant[],
  ageSplits: AgeSplitRef[] = [],
): EventDetails {
  return {
    id: 'event-1',
    name: 'Кубок города',
    eventType: 'RACE',
    sport: 'RUN',
    eventDate: '2026-11-13T09:00:00.000Z',
    distanceKm: null,
    description: null,
    mapLink: null,
    registrationOpen: null,
    registrationClose: null,
    status: 'IN_PROGRESS',
    createdAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-01T09:00:00.000Z',
    track: { id: 'track-1', name: 'Трасса', locationCity: null, mapLink: null },
    createdBy: null,
    formats,
    laps: [],
    starts,
    registrations,
    registeredCount: registrations.length,
    finishedCategories: [],
    ageSplits,
  };
}

function mockSession(session: {
  authenticated: boolean;
  userId: string | null;
  roles: string[];
}) {
  vi.mocked(useSessionQuery).mockReturnValue({
    data: session,
    isLoading: false,
    isFetched: true,
  } as unknown as ReturnType<typeof useSessionQuery>);
}

function mockEvent(
  registrations: EventParticipant[],
  ageSplits: AgeSplitRef[] = [],
) {
  vi.mocked(useEventDetailsQuery).mockReturnValue({
    data: eventDetails(registrations, ageSplits),
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useEventDetailsQuery>);
}

function mockCompetitions(competitions: ClassCompetitionView[] = []) {
  vi.mocked(useClassCompetitionsQuery).mockReturnValue({
    data: competitions,
    isSuccess: true,
    isError: false,
    isLoading: false,
  } as unknown as ReturnType<typeof useClassCompetitionsQuery>);
}

function renderEventPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/events/event-1']}>
        <Routes>
          <Route path="/events/:id" element={<EventPage />} />
          <Route
            path="/events/:id/timing"
            element={<div>{TIMING_SURFACE_TEXT}</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function protocolRow(fullName: string): HTMLElement {
  const cell = screen.getByText(fullName);
  const row = cell.closest('tr');
  if (!row) throw new Error(`no protocol row for ${fullName}`);
  return row;
}

function protocolBlock(fullName: string): HTMLElement {
  let node: HTMLElement | null = protocolRow(fullName);
  while (node && !node.querySelector('button[aria-expanded]')) {
    node = node.parentElement;
  }
  if (!node) throw new Error(`no protocol block for ${fullName}`);
  return node;
}

function blockCollapseToggle(block: HTMLElement): HTMLButtonElement {
  const toggle = block.querySelector('button[aria-expanded]');
  if (!(toggle instanceof HTMLButtonElement)) {
    throw new Error('no protocol block collapse toggle');
  }
  return toggle;
}

function blockIsExpanded(block: HTMLElement): boolean {
  return blockCollapseToggle(block).getAttribute('aria-expanded') === 'true';
}

const reader = { authenticated: true, userId: 'user-reader', roles: [] };
const anonymous = { authenticated: false, userId: null, roles: [] };

const timingFixture: EventParticipant[] = [
  participant({ id: 'row-reader', enrollmentId: 'enrollment-reader' }),
];

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: true,
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

describe('EventPage timing entry', () => {
  it('offers the timing entry to a referee', () => {
    mockSession({ authenticated: true, userId: 'ref-1', roles: ['REFEREE'] });
    mockEvent(timingFixture);
    mockCompetitions();

    renderEventPage();

    expect(screen.getByRole('button', { name: /Хронометраж/ })).not.toBeNull();
  });

  it('offers the timing entry to an administrator', () => {
    mockSession({
      authenticated: true,
      userId: 'admin-1',
      roles: ['ADMINISTRATOR'],
    });
    mockEvent(timingFixture);
    mockCompetitions();

    renderEventPage();

    expect(screen.getByRole('button', { name: /Хронометраж/ })).not.toBeNull();
  });

  it('offers no timing entry to an organizer without REFEREE', () => {
    mockSession({
      authenticated: true,
      userId: 'org-1',
      roles: ['ORGANIZER'],
    });
    mockEvent(timingFixture);
    mockCompetitions();

    renderEventPage();

    expect(screen.queryByRole('button', { name: /Хронометраж/ })).toBeNull();
  });

  it('offers no timing entry to a reader and to an unauthenticated visitor', () => {
    mockSession(reader);
    mockEvent(timingFixture);
    mockCompetitions();
    renderEventPage();
    expect(screen.queryByRole('button', { name: /Хронометраж/ })).toBeNull();
    cleanup();

    mockSession(anonymous);
    mockEvent(timingFixture);
    mockCompetitions();
    renderEventPage();
    expect(screen.queryByRole('button', { name: /Хронометраж/ })).toBeNull();
  });

  it('opens the timing surface of the event when pressed', () => {
    mockSession({ authenticated: true, userId: 'ref-1', roles: ['REFEREE'] });
    mockEvent(timingFixture);
    mockCompetitions();

    renderEventPage();
    fireEvent.click(screen.getByRole('button', { name: /Хронометраж/ }));

    expect(screen.getByText(TIMING_SURFACE_TEXT)).not.toBeNull();
  });
});

describe('EventPage protocol splits', () => {
  const splitRows: EventParticipant[] = [
    participant({
      id: 'row-splits',
      enrollmentId: 'enrollment-splits',
      fullName: 'Иван Сплитов',
      startNumber: 1,
      outcome: 'FINISHED',
      finishTimeMs: 25_000,
      place: 1,
      lapSplits: [
        { lapNumber: 1, lapTimeMs: 10_000, cumulativeMs: 10_000 },
        { lapNumber: 2, lapTimeMs: 15_000, cumulativeMs: 25_000 },
      ],
    }),
    participant({
      id: 'row-manual',
      enrollmentId: 'enrollment-manual',
      fullName: 'Пётр Ручной',
      startNumber: 2,
      outcome: 'FINISHED',
      finishTimeMs: 3_600_000,
      place: 2,
    }),
    participant({
      id: 'row-legacy',
      enrollmentId: 'enrollment-legacy',
      fullName: 'Семён Наследие',
      startNumber: 3,
      outcome: 'FINISHED',
      finishTimeMs: 1_000,
      place: 3,
      laps: [{ lapNumber: 1, timeMilliseconds: 12_345 }],
    }),
  ];

  function renderSplits() {
    mockSession(reader);
    mockEvent(splitRows);
    mockCompetitions();
    renderEventPage();
  }

  it('renders the lap time and the cumulative time of every published split', () => {
    renderSplits();

    const row = protocolRow('Иван Сплитов');

    expect(within(row).getByText('Круг 1: 00:00:10.000')).not.toBeNull();
    expect(within(row).getByText('Итог: 00:00:10.000')).not.toBeNull();
    expect(within(row).getByText('Круг 2: 00:00:15.000')).not.toBeNull();
    expect(within(row).getByText('Итог: 00:00:25.000')).not.toBeNull();
    expect(
      within(row).getByLabelText(
        'Круг 1 из 2: круг 00:00:10.000, итог 00:00:10.000',
      ),
    ).not.toBeNull();
    expect(
      within(row).getByLabelText(
        'Круг 2 из 2: круг 00:00:15.000, итог 00:00:25.000',
      ),
    ).not.toBeNull();
    expect(within(row).getByText('00:00:25')).not.toBeNull();
  });

  it('renders nothing in that column for a row without splits', () => {
    renderSplits();

    const row = protocolRow('Пётр Ручной');

    expect(within(row).queryByLabelText(/^Круг \d/)).toBeNull();
    expect(within(row).queryByText(/^Итог: /)).toBeNull();
    expect(within(row).getByText('01:00:00')).not.toBeNull();
  });

  it('leaves a legacy laps row unchanged and shows no split for it', () => {
    renderSplits();

    const row = protocolRow('Семён Наследие');

    expect(within(row).queryByLabelText(/^Круг \d/)).toBeNull();
    expect(within(row).queryByText(/12\.345/)).toBeNull();
    expect(within(row).getByText('00:00:01')).not.toBeNull();
  });
});

const administrator = {
  authenticated: true,
  userId: 'admin-1',
  roles: ['ADMINISTRATOR'],
};

const splitBothGenders: AgeSplitRef[] = [
  { ...split, gender: 'M' },
  { ...split, gender: 'F' },
];

const siblingRows: EventParticipant[] = [
  participant({
    id: 'm-cat-1',
    fullName: 'Иван Первый',
    gender: 'M',
    sectionId: 'CATEGORY_1',
    startNumber: 1,
  }),
  participant({
    id: 'm-cat-2',
    fullName: 'Пётр Второй',
    gender: 'M',
    sectionId: 'CATEGORY_2',
    startNumber: 2,
  }),
  participant({
    id: 'f-cat-1',
    fullName: 'Анна Третья',
    gender: 'F',
    sectionId: 'CATEGORY_1',
    startNumber: 3,
  }),
];

const raceCompetition: ClassCompetitionView = {
  id: 'race-1',
  eventId: 'event-1',
  startId: 'start-a',
  formatId: 1,
  gender: 'M',
  sectionId: 'CATEGORY_1',
  sectionKind: 'CATEGORY',
  title: 'Категория 1',
  subtitle: null,
  targetGroupIds: ['AGE_24_40'],
  targetWholeCategory: false,
  capturedEnrollmentIds: [],
  youngestBound: 24,
  status: 'DONE',
  stages: [],
  classification: [],
};

const raceRows: EventParticipant[] = [
  participant({
    id: 'm-race',
    fullName: 'Иван Гонщик',
    gender: 'M',
    sectionId: 'CATEGORY_1',
    raceId: 'race-1',
    startNumber: 1,
  }),
  participant({
    id: 'm-simple',
    fullName: 'Пётр Простой',
    gender: 'M',
    sectionId: 'CATEGORY_2',
    startNumber: 2,
  }),
];

/**
 * A phone viewport clears every breakpoint, so Grid.md is false and the page
 * offers the compact/full protocol control. The antd breakpoint observer
 * re-reads matchMedia on the first render after the previous unmount.
 */
function mockPhoneViewport(): () => void {
  const previous = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = previous;
  };
}

function renderProtocol(
  registrations: EventParticipant[],
  ageSplits: AgeSplitRef[],
  competitions: ClassCompetitionView[] = [],
) {
  mockSession(administrator);
  mockEvent(registrations, ageSplits);
  mockCompetitions(competitions);
  renderEventPage();
}

describe('EventPage per-block protocol collapse', () => {
  it('collapses only the block whose section id another gender also shows', () => {
    renderProtocol(siblingRows, splitBothGenders);

    const menBlock = protocolBlock('Иван Первый');
    const menSiblingBlock = protocolBlock('Пётр Второй');
    const womenBlock = protocolBlock('Анна Третья');

    fireEvent.click(blockCollapseToggle(menBlock));

    expect(blockIsExpanded(menBlock)).toBe(false);
    expect(
      within(menBlock).getByRole('button', { name: 'Развернуть категорию' }),
    ).not.toBeNull();
    expect(within(menBlock).queryByText('Иван Первый')).toBeNull();

    expect(blockIsExpanded(menSiblingBlock)).toBe(true);
    expect(within(menSiblingBlock).getByText('Пётр Второй')).not.toBeNull();

    expect(blockIsExpanded(womenBlock)).toBe(true);
    expect(
      within(womenBlock).getByRole('button', { name: 'Свернуть категорию' }),
    ).not.toBeNull();
    expect(within(womenBlock).getByText('Анна Третья')).not.toBeNull();
  });

  it('expands back only the block that was collapsed', () => {
    renderProtocol(siblingRows, splitBothGenders);

    const menBlock = protocolBlock('Иван Первый');
    const womenBlock = protocolBlock('Анна Третья');

    fireEvent.click(blockCollapseToggle(womenBlock));
    fireEvent.click(blockCollapseToggle(menBlock));
    expect(blockIsExpanded(menBlock)).toBe(false);
    expect(blockIsExpanded(womenBlock)).toBe(false);

    fireEvent.click(blockCollapseToggle(menBlock));

    expect(blockIsExpanded(menBlock)).toBe(true);
    expect(within(menBlock).getByText('Иван Первый')).not.toBeNull();
    expect(blockIsExpanded(womenBlock)).toBe(false);
    expect(within(womenBlock).queryByText('Анна Третья')).toBeNull();
  });

  it('keeps a race block and a simple block independent', () => {
    renderProtocol(raceRows, [{ ...split, gender: 'M' }], [raceCompetition]);

    const raceBlock = protocolBlock('Иван Гонщик');
    const simpleBlock = protocolBlock('Пётр Простой');

    fireEvent.click(blockCollapseToggle(raceBlock));

    expect(blockIsExpanded(raceBlock)).toBe(false);
    expect(within(raceBlock).queryByText('Иван Гонщик')).toBeNull();
    expect(blockIsExpanded(simpleBlock)).toBe(true);
    expect(within(simpleBlock).getByText('Пётр Простой')).not.toBeNull();

    fireEvent.click(blockCollapseToggle(simpleBlock));

    expect(blockIsExpanded(raceBlock)).toBe(false);
    expect(blockIsExpanded(simpleBlock)).toBe(false);

    fireEvent.click(blockCollapseToggle(raceBlock));

    expect(blockIsExpanded(raceBlock)).toBe(true);
    expect(within(raceBlock).getByText('Иван Гонщик')).not.toBeNull();
    expect(blockIsExpanded(simpleBlock)).toBe(false);
  });

  it('starts every block expanded after a remount', () => {
    renderProtocol(siblingRows, splitBothGenders);
    fireEvent.click(blockCollapseToggle(protocolBlock('Иван Первый')));
    expect(blockIsExpanded(protocolBlock('Пётр Второй'))).toBe(true);
    cleanup();

    renderProtocol(siblingRows, splitBothGenders);

    expect(blockIsExpanded(protocolBlock('Иван Первый'))).toBe(true);
    expect(blockIsExpanded(protocolBlock('Пётр Второй'))).toBe(true);
    expect(blockIsExpanded(protocolBlock('Анна Третья'))).toBe(true);
  });

  it('keeps the category controls, search and filters working across a collapsed block', () => {
    renderProtocol(siblingRows, splitBothGenders);

    const search = screen.getByLabelText('Поиск по участнику');
    fireEvent.change(search, { target: { value: 'Иван' } });

    expect(screen.getByText('Иван Первый')).not.toBeNull();
    expect(screen.queryByText('Анна Третья')).toBeNull();
    expect(screen.getAllByLabelText('Фильтр по городу')).not.toHaveLength(0);
    expect(screen.getAllByLabelText('Фильтр по команде')).not.toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
    expect(screen.getByText('Анна Третья')).not.toBeNull();

    const menBlock = protocolBlock('Иван Первый');
    const womenBlock = protocolBlock('Анна Третья');
    fireEvent.click(blockCollapseToggle(menBlock));

    expect(screen.getAllByRole('button', { name: 'Возрастные категории' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Завершить гонку' })).toHaveLength(2);
    expect(screen.getByLabelText('Поиск по участнику')).not.toBeNull();
    expect(blockIsExpanded(womenBlock)).toBe(true);
  });

  it('keeps the compact/full protocol control working while a block is collapsed', () => {
    const restoreViewport = mockPhoneViewport();
    try {
      renderProtocol(siblingRows, splitBothGenders);
      expect(screen.getAllByRole('button', { name: 'Полный протокол' })).toHaveLength(2);

      const menBlock = protocolBlock('Иван Первый');
      const womenBlock = protocolBlock('Анна Третья');
      fireEvent.click(blockCollapseToggle(menBlock));
      expect(blockIsExpanded(menBlock)).toBe(false);

      fireEvent.click(screen.getAllByRole('button', { name: 'Полный протокол' })[0]);

      expect(screen.getAllByRole('button', { name: 'Краткий протокол' })).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: 'Полный протокол' })).toHaveLength(1);
      expect(blockIsExpanded(menBlock)).toBe(false);
      expect(blockIsExpanded(womenBlock)).toBe(true);
    } finally {
      restoreViewport();
    }
  });

  it('renders a filtered-out block expanded again and keeps a rendered sibling collapsed', () => {
    renderProtocol(siblingRows, splitBothGenders);

    const menBlock = protocolBlock('Иван Первый');
    const menSiblingBlock = protocolBlock('Пётр Второй');
    fireEvent.click(blockCollapseToggle(menBlock));
    fireEvent.click(blockCollapseToggle(menSiblingBlock));
    expect(blockIsExpanded(menBlock)).toBe(false);
    expect(blockIsExpanded(menSiblingBlock)).toBe(false);

    fireEvent.change(screen.getByLabelText('Поиск по участнику'), {
      target: { value: 'Второй' },
    });

    expect(screen.queryByText('Иван Первый')).toBeNull();
    expect(blockIsExpanded(menSiblingBlock)).toBe(false);
    expect(within(menSiblingBlock).queryByText('Пётр Второй')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));

    const restoredBlock = protocolBlock('Иван Первый');
    expect(blockIsExpanded(restoredBlock)).toBe(true);
    expect(within(restoredBlock).getByText('Иван Первый')).not.toBeNull();
    expect(blockIsExpanded(menSiblingBlock)).toBe(false);
    expect(
      screen.getAllByRole('button', { name: 'Развернуть категорию' }),
    ).toHaveLength(1);
  });
});

