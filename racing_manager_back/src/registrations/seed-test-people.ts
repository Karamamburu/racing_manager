const FIRST_NAMES_M = [
  'Алексей',
  'Иван',
  'Дмитрий',
  'Сергей',
  'Андрей',
  'Никита',
  'Павел',
  'Михаил',
  'Егор',
  'Артём',
  'Кирилл',
  'Роман',
  'Олег',
  'Илья',
  'Максим',
];

const FIRST_NAMES_F = [
  'Анна',
  'Мария',
  'Елена',
  'Ольга',
  'Дарья',
  'София',
  'Алина',
  'Ирина',
  'Полина',
  'Ксения',
  'Виктория',
  'Наталья',
  'Юлия',
  'Екатерина',
  'Татьяна',
];

const LAST_NAMES = [
  'Иванов',
  'Петров',
  'Смирнов',
  'Кузнецов',
  'Попов',
  'Соколов',
  'Лебедев',
  'Козлов',
  'Новиков',
  'Морозов',
  'Волков',
  'Соловьёв',
  'Васильев',
  'Зайцев',
  'Павлов',
  'Семёнов',
  'Голубев',
  'Виноградов',
  'Богданов',
  'Воробьёв',
];

const CITIES = [
  'Москва',
  'Химки',
  'Зеленоград',
  'Одинцово',
  'Мытищи',
  'Красногорск',
];

export type TestPerson = {
  firstName: string;
  lastName: string;
  birthYear: number;
  city: string;
};

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function personKey(
  firstName: string,
  lastName: string,
  birthYear: number,
): string {
  return `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${birthYear}`;
}

/**
 * Birth-year windows covering every FLGR age band for the event's season.
 * Seed data must exercise the whole age categorization, from the youngest
 * youth band to the 61+ masters.
 */
function seedBirthYearBands(controlYear: number): Array<[number, number]> {
  return [
    [controlYear - 14, controlYear - 8],
    [controlYear - 16, controlYear - 15],
    [controlYear - 18, controlYear - 17],
    [controlYear - 20, controlYear - 19],
    [controlYear - 23, controlYear - 21],
    [controlYear - 40, controlYear - 24],
    [controlYear - 50, controlYear - 41],
    [controlYear - 60, controlYear - 51],
    [controlYear - 75, controlYear - 61],
  ];
}

function randomYear([min, max]: readonly [number, number]): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function buildTestPeople(
  count: number,
  gender: 'M' | 'F',
  takenKeys: Iterable<string>,
  controlYear: number,
): TestPerson[] {
  const used = new Set(takenKeys);
  const firstNames = gender === 'M' ? FIRST_NAMES_M : FIRST_NAMES_F;
  const bands = shuffled(seedBirthYearBands(controlYear));
  const people: TestPerson[] = [];
  const maxAttempts = count * 40;

  for (
    let attempt = 0;
    people.length < count && attempt < maxAttempts;
    attempt += 1
  ) {
    const firstName = pick(firstNames);
    const lastName =
      gender === 'F' ? feminineLastName(pick(LAST_NAMES)) : pick(LAST_NAMES);
    // Round-robin over the bands so a run of nine or more people covers every
    // age category instead of clustering around one random range.
    const birthYear = randomYear(bands[people.length % bands.length]);
    const key = personKey(firstName, lastName, birthYear);
    if (used.has(key)) continue;
    used.add(key);
    people.push({ firstName, lastName, birthYear, city: pick(CITIES) });
  }

  if (people.length < count) {
    throw new Error('Not enough unique test names.');
  }
  return people;
}

export function guestPersonKey(
  firstName: string,
  lastName: string,
  birthYear: number,
): string {
  return personKey(firstName, lastName, birthYear);
}

function feminineLastName(lastName: string): string {
  if (
    lastName.endsWith('ов') ||
    lastName.endsWith('ев') ||
    lastName.endsWith('ёв') ||
    lastName.endsWith('ин')
  ) {
    return `${lastName}а`;
  }
  return lastName;
}
