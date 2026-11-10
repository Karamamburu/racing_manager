/**
 * Domain errors of the age-category configuration write.
 *
 * Deliberately free of Nest and Prisma imports: the service raises them and the
 * controller-layer exception filter maps them to HTTP (AGENTS.md §5).
 */
export const CATEGORY_NOT_FOUND_MESSAGE =
  'Категория не найдена на этом мероприятии.';

export const EMPTY_AGE_CATEGORIES_MESSAGE =
  'Нужна хотя бы одна возрастная категория с группой.';

export class AgeSplitDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgeSplitDomainError';
  }
}

/** The addressed start/format link does not exist on the event (W-04). */
export class AgeSplitCategoryNotFoundError extends AgeSplitDomainError {
  constructor(message: string) {
    super(message);
    this.name = 'AgeSplitCategoryNotFoundError';
  }
}

/** An enabled save carries no age category with a base group (W-01). */
export class EmptyAgeCategoriesError extends AgeSplitDomainError {
  constructor(message: string) {
    super(message);
    this.name = 'EmptyAgeCategoriesError';
  }
}
