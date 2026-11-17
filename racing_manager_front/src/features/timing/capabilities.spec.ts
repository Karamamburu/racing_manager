import { describe, expect, it } from 'vitest';
import { canAdministerTiming, canOperateTiming } from './capabilities';

describe('canOperateTiming', () => {
  it('allows a referee and an administrator', () => {
    expect(canOperateTiming(['REFEREE'])).toBe(true);
    expect(canOperateTiming(['ADMINISTRATOR'])).toBe(true);
    expect(canOperateTiming(['ORGANIZER', 'REFEREE'])).toBe(true);
  });

  it('refuses an organizer alone and an empty or absent role list', () => {
    expect(canOperateTiming(['ORGANIZER'])).toBe(false);
    expect(canOperateTiming([])).toBe(false);
    expect(canOperateTiming(undefined)).toBe(false);
  });

  it('refuses an unrelated role', () => {
    expect(canOperateTiming(['USER'])).toBe(false);
  });
});

describe('canAdministerTiming', () => {
  it('allows an administrator only', () => {
    expect(canAdministerTiming(['ADMINISTRATOR'])).toBe(true);
    expect(canAdministerTiming(['ADMINISTRATOR', 'REFEREE'])).toBe(true);
  });

  it('refuses a referee, an organizer and an absent role list', () => {
    expect(canAdministerTiming(['REFEREE'])).toBe(false);
    expect(canAdministerTiming(['REFEREE', 'ORGANIZER'])).toBe(false);
    expect(canAdministerTiming([])).toBe(false);
    expect(canAdministerTiming(undefined)).toBe(false);
  });
});
