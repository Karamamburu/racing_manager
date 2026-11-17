import { describe, expect, it } from 'vitest';
import { areActiveStartNumbersIssued } from './registrationWindow';

describe('areActiveStartNumbersIssued', () => {
  it('accepts a non-empty active field with every number issued', () => {
    expect(
      areActiveStartNumbersIssued([
        { status: 'REGISTERED', startNumber: 1 },
        { status: 'CONFIRMED', startNumber: 2 },
      ]),
    ).toBe(true);
  });

  it('ignores cancelled and withdrawn registrations without numbers', () => {
    expect(
      areActiveStartNumbersIssued([
        { status: 'REGISTERED', startNumber: 1 },
        { status: 'CANCELLED', startNumber: null },
        { status: 'WITHDRAWN', startNumber: null },
      ]),
    ).toBe(true);
  });

  it('refuses while an active registration has no number', () => {
    expect(
      areActiveStartNumbersIssued([
        { status: 'REGISTERED', startNumber: 1 },
        { status: 'REGISTERED', startNumber: null },
      ]),
    ).toBe(false);
  });

  it('refuses an empty field and a zero placeholder', () => {
    expect(areActiveStartNumbersIssued([])).toBe(false);
    expect(
      areActiveStartNumbersIssued([{ status: 'REGISTERED', startNumber: 0 }]),
    ).toBe(false);
  });
});
