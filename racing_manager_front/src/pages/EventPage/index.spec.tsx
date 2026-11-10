import { describe, expect, it } from 'vitest';
import {
  AGE_SPLIT_BLOCKING_EVENT_STATUSES,
  resolveAgeSplitSelection,
  type AgeSplitSelectionInput,
} from './index';

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
