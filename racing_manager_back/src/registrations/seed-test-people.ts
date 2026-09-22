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

const CITIES = ['Москва', 'Химки', 'Зеленоград', 'Одинцово', 'Мытищи', 'Красногорск'];

export type TestPerson = {
  firstName: string;
  lastName: string;
  birthYear: number;
  city: string;
};

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function personKey(firstName: string, lastName: string, birthYear: number): string {
  return `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${birthYear}`;
}

export function buildTestPeople(
  count: number,
  gender: 'M' | 'F',
  takenKeys: Iterable<string>,
): TestPerson[] {
  const used = new Set(takenKeys);
  const firstNames = gender === 'M' ? FIRST_NAMES_M : FIRST_NAMES_F;
  const people: TestPerson[] = [];
  const maxAttempts = count * 40;

  for (let attempt = 0; people.length < count && attempt < maxAttempts; attempt += 1) {
    const firstName = pick(firstNames);
    const lastName = gender === 'F' ? feminineLastName(pick(LAST_NAMES)) : pick(LAST_NAMES);
    const birthYear = 1975 + Math.floor(Math.random() * 35);
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

export function guestPersonKey(firstName: string, lastName: string, birthYear: number): string {
  return personKey(firstName, lastName, birthYear);
}

function feminineLastName(lastName: string): string {
  if (lastName.endsWith('ов') || lastName.endsWith('ев') || lastName.endsWith('ёв') || lastName.endsWith('ин')) {
    return `${lastName}а`;
  }
  return lastName;
}
