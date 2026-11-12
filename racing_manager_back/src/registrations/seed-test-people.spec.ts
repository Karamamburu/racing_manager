import { ageGroupFor, type AgeGroupId } from '../events/age-groups';
import { buildTestPeople, guestPersonKey } from './seed-test-people';

const CONTROL_YEAR = 2027;

function groupsOf(people: ReturnType<typeof buildTestPeople>): Set<AgeGroupId> {
  const groups = new Set<AgeGroupId>();
  for (const person of people) {
    const group = ageGroupFor(person.birthYear, CONTROL_YEAR);
    if (group) groups.add(group);
  }
  return groups;
}

describe('buildTestPeople', () => {
  it('covers every age band when nine or more people are created', () => {
    const people = buildTestPeople(18, 'M', [], CONTROL_YEAR);

    expect(people).toHaveLength(18);
    expect([...groupsOf(people)].sort()).toEqual(
      [
        'AGE_LE_14',
        'AGE_15_16',
        'AGE_17_18',
        'AGE_19_20',
        'AGE_21_23',
        'AGE_24_40',
        'AGE_41_50',
        'AGE_51_60',
        'AGE_61_PLUS',
      ].sort(),
    );
  });

  it('includes the youngest and the oldest participants for a small run', () => {
    const people = buildTestPeople(9, 'F', [], CONTROL_YEAR);
    const groups = groupsOf(people);

    expect(groups.has('AGE_LE_14')).toBe(true);
    expect(groups.has('AGE_61_PLUS')).toBe(true);
  });

  it('keeps every birth year inside the widened range', () => {
    const people = buildTestPeople(30, 'M', [], CONTROL_YEAR);

    for (const person of people) {
      expect(person.birthYear).toBeGreaterThanOrEqual(CONTROL_YEAR - 75);
      expect(person.birthYear).toBeLessThanOrEqual(CONTROL_YEAR - 8);
    }
  });

  it('returns unique person keys and never reuses a taken key', () => {
    const first = buildTestPeople(12, 'M', [], CONTROL_YEAR);
    const taken = first.map((person) =>
      guestPersonKey(person.firstName, person.lastName, person.birthYear),
    );
    const second = buildTestPeople(12, 'M', taken, CONTROL_YEAR);

    const keys = [
      ...taken,
      ...second.map((person) =>
        guestPersonKey(person.firstName, person.lastName, person.birthYear),
      ),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('handles a run shorter than the number of bands', () => {
    const people = buildTestPeople(4, 'F', [], CONTROL_YEAR);

    expect(people).toHaveLength(4);
    expect(new Set(people.map((person) => person.birthYear)).size).toBe(4);
  });
});
