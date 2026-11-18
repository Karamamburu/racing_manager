/**
 * IndexedDB outbox for the capture surface.
 *
 * AD-3: every capture-surface mutation (pass create, pending-finish bind, quick
 * undo, anonymous split assignment) carries a contiguous `deviceSequence` per
 * `(attempt, workstation instance)`, and the API writes one receipt per
 * sequence. That is only true if the mutation is stored *before* it is sent, so
 * this module offers write-before-send persistence and never reuses a sequence
 * number.
 *
 * The native `indexedDB` API is used directly: one database,
 * `racing_manager_timing`, version 1, with a `mutations` store keyed by the
 * idempotency key and a `cursors` store keyed by
 * `${attemptId}:${workstationInstanceId}`. When IndexedDB is missing (server
 * rendering, jsdom, a private window that refuses storage) or fails to open,
 * the same contract is served from a memory map so the surface still captures;
 * that fallback is lost on reload, and the unsynced items it holds remain
 * visible through `pendingCount`. `isDurable` reports which storage the queue
 * actually resolved, so the page never guesses from `typeof indexedDB`.
 */

import type {
  AssignAnonymousSplitRequest,
  StartOfflineTimingAttemptRequest,
} from './types';

export const TIMING_QUEUE_OPERATIONS = [
  'START',
  'PASS',
  'BIND',
  'UNDO',
  'ANONYMOUS_ASSIGN',
] as const;

export type TimingMutationOperation = (typeof TIMING_QUEUE_OPERATIONS)[number];

/**
 * The stored payload of an `ANONYMOUS_ASSIGN` item: the split that leaves the
 * queue and the request body that binds it, so a replay needs no surface read.
 * An anonymous capture is a `PASS` item whose payload kind is
 * `ANONYMOUS_SPLIT`. A split that was local when the assignment was recorded is
 * named by its event capture sequence; a split the server already has keeps the
 * server split id.
 */
export interface TimingAnonymousAssignPayload {
  splitId?: string;
  captureDeviceSequence?: number;
  request: AssignAnonymousSplitRequest;
}

/** The stored payload of a `START` item: the offline Start request. */
export type TimingStartPayload = StartOfflineTimingAttemptRequest;

export const TIMING_QUEUE_STATUSES = [
  'PENDING',
  'SENT',
  'APPLIED',
  'REJECTED',
] as const;

export type TimingMutationStatus = (typeof TIMING_QUEUE_STATUSES)[number];

/** Statuses that still hold the attempt back from completion. */
const UNSYNCED_STATUSES: readonly TimingMutationStatus[] = ['PENDING', 'SENT'];

/** One queued capture-surface mutation. */
export interface TimingQueueItem {
  /** The idempotency key of the request this item represents. */
  id: string;
  attemptId: string;
  workstationInstanceId: string;
  /** Monotonic sequence of the workstation within the attempt, from 1. */
  deviceSequence: number;
  operation: TimingMutationOperation;
  payload: unknown;
  status: TimingMutationStatus;
  /** ISO-8601 moment the item entered the outbox. */
  createdAt: string;
  /** Why the API refused the item; present while `status` is `REJECTED`. */
  error?: string;
  /** Device-local Start identity of a local attempt; absent on server rows. */
  localAttemptId?: string;
  localClockEpochId?: string;
  /** The server attempt and epoch written by the Start mapping. */
  serverAttemptId?: string | null;
  serverClockEpochId?: string | null;
  /** The attempt that anchored a local split's clock. */
  localAnchorAttemptId?: string | null;
  /** The event the row belongs to, so cross-scope ordering can compare rows. */
  eventId?: string;
  /**
   * Device-local display facts of an offline Start snapshot: names, sections,
   * numbers and N. They are never sent to the server; the request's `roster`
   * carries the validated identity fields.
   */
  localRoster?: TimingLocalRosterRow[];
}

/** One device-local row of an offline Start snapshot. */
export interface TimingLocalRosterRow {
  enrollmentId: string;
  fullName: string;
  sectionId: string;
  startNumber: number | null;
  requiredLaps: number;
  excludedReason: string | null;
}

/** The outbox contract the surface codes against. */
export interface TimingQueue {
  /**
   * Whether the outbox outlives a reload. True only when the queue resolved
   * IndexedDB; the memory fallback reports false, so the page never has to
   * infer durability from `typeof indexedDB`.
   */
  readonly isDurable: boolean;
  /** Allocates the next sequence of one attempt and workstation, from 1. */
  nextSequence(attemptId: string, workstationInstanceId: string): Promise<number>;
  /**
   * The highest sequence this workstation issued for the attempt, or zero when
   * it issued none. Completion reports it and the API refuses a gap.
   */
  lastSequence(attemptId: string, workstationInstanceId: string): Promise<number>;
  /** Stores the item before the caller sends it. */
  enqueue(item: TimingQueueItem): Promise<void>;
  /** Every item, or every item of one attempt, in capture order. */
  list(attemptId?: string): Promise<TimingQueueItem[]>;
  /** Records a new status and, for a refusal, its reason. */
  mark(
    id: string,
    status: TimingMutationStatus,
    error?: string,
  ): Promise<void>;
  /** Drops an item once the server applied it, or the operator resolved it. */
  remove(id: string): Promise<void>;
  /** How many items of the attempt still need the server. */
  pendingCount(attemptId?: string): Promise<number>;
  /**
   * Empties the outbox. Sequence cursors are kept on purpose: `lastSequence`
   * still reports what was issued and `nextSequence` continues from there.
   */
  clear(): Promise<void>;
}

const DATABASE_NAME = 'racing_manager_timing';
const DATABASE_VERSION = 1;
const MUTATIONS_STORE = 'mutations';
const CURSORS_STORE = 'cursors';

function cursorKey(attemptId: string, workstationInstanceId: string): string {
  return `${attemptId}:${workstationInstanceId}`;
}

function compareItems(first: TimingQueueItem, second: TimingQueueItem): number {
  if (first.createdAt !== second.createdAt) {
    return first.createdAt < second.createdAt ? -1 : 1;
  }
  return first.deviceSequence - second.deviceSequence;
}

/** Generates the idempotency key of one mutation. */
export function newTimingMutationKey(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `timing-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/** The persistence port; two implementations, one contract. */
interface TimingQueueStorage {
  /** Whether this storage survives a page reload. */
  readonly isDurable: boolean;
  nextSequence(attemptId: string, workstationInstanceId: string): Promise<number>;
  lastSequence(attemptId: string, workstationInstanceId: string): Promise<number>;
  put(item: TimingQueueItem): Promise<void>;
  all(): Promise<TimingQueueItem[]>;
  get(id: string): Promise<TimingQueueItem | undefined>;
  delete(id: string): Promise<void>;
  clearMutations(): Promise<void>;
}

/**
 * Used when IndexedDB is unavailable. The maps live at module scope so two
 * `openTimingQueue()` calls in one runtime share the same queue and the same
 * sequence cursors, mirroring a real reload against IndexedDB.
 */
class MemoryTimingQueueStorage implements TimingQueueStorage {
  public readonly isDurable = false;

  private readonly mutations = new Map<string, TimingQueueItem>();

  private readonly cursors = new Map<string, number>();

  public async nextSequence(
    attemptId: string,
    workstationInstanceId: string,
  ): Promise<number> {
    const key = cursorKey(attemptId, workstationInstanceId);
    const next = (this.cursors.get(key) ?? 0) + 1;
    this.cursors.set(key, next);
    return next;
  }

  public async lastSequence(
    attemptId: string,
    workstationInstanceId: string,
  ): Promise<number> {
    return this.cursors.get(cursorKey(attemptId, workstationInstanceId)) ?? 0;
  }

  public async put(item: TimingQueueItem): Promise<void> {
    this.mutations.set(item.id, { ...item });
  }

  public async all(): Promise<TimingQueueItem[]> {
    return [...this.mutations.values()].map((item) => ({ ...item }));
  }

  public async get(id: string): Promise<TimingQueueItem | undefined> {
    const item = this.mutations.get(id);
    return item === undefined ? undefined : { ...item };
  }

  public async delete(id: string): Promise<void> {
    this.mutations.delete(id);
  }

  public async clearMutations(): Promise<void> {
    this.mutations.clear();
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(MUTATIONS_STORE)) {
        database.createObjectStore(MUTATIONS_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(CURSORS_STORE)) {
        database.createObjectStore(CURSORS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () =>
      reject(new Error('IndexedDB open blocked by another connection'));
  });
}

class IndexedDbTimingQueueStorage implements TimingQueueStorage {
  public readonly isDurable = true;

  constructor(private readonly database: IDBDatabase) {}

  public async nextSequence(
    attemptId: string,
    workstationInstanceId: string,
  ): Promise<number> {
    const key = cursorKey(attemptId, workstationInstanceId);
    const transaction = this.database.transaction(CURSORS_STORE, 'readwrite');
    const store = transaction.objectStore(CURSORS_STORE);
    const current = await requestResult<number | undefined>(
      store.get(key) as IDBRequest<number | undefined>,
    );
    const next = (typeof current === 'number' ? current : 0) + 1;
    store.put(next, key);
    await transactionDone(transaction);
    return next;
  }

  public async lastSequence(
    attemptId: string,
    workstationInstanceId: string,
  ): Promise<number> {
    const key = cursorKey(attemptId, workstationInstanceId);
    const transaction = this.database.transaction(CURSORS_STORE, 'readonly');
    const store = transaction.objectStore(CURSORS_STORE);
    const current = await requestResult<number | undefined>(
      store.get(key) as IDBRequest<number | undefined>,
    );
    await transactionDone(transaction);
    return typeof current === 'number' ? current : 0;
  }

  public async put(item: TimingQueueItem): Promise<void> {
    const transaction = this.database.transaction(MUTATIONS_STORE, 'readwrite');
    transaction.objectStore(MUTATIONS_STORE).put(item);
    await transactionDone(transaction);
  }

  public async all(): Promise<TimingQueueItem[]> {
    const transaction = this.database.transaction(MUTATIONS_STORE, 'readonly');
    const store = transaction.objectStore(MUTATIONS_STORE);
    const items = await requestResult<TimingQueueItem[]>(
      store.getAll() as IDBRequest<TimingQueueItem[]>,
    );
    await transactionDone(transaction);
    return items;
  }

  public async get(id: string): Promise<TimingQueueItem | undefined> {
    const transaction = this.database.transaction(MUTATIONS_STORE, 'readonly');
    const store = transaction.objectStore(MUTATIONS_STORE);
    const item = await requestResult<TimingQueueItem | undefined>(
      store.get(id) as IDBRequest<TimingQueueItem | undefined>,
    );
    await transactionDone(transaction);
    return item;
  }

  public async delete(id: string): Promise<void> {
    const transaction = this.database.transaction(MUTATIONS_STORE, 'readwrite');
    transaction.objectStore(MUTATIONS_STORE).delete(id);
    await transactionDone(transaction);
  }

  public async clearMutations(): Promise<void> {
    const transaction = this.database.transaction(MUTATIONS_STORE, 'readwrite');
    transaction.objectStore(MUTATIONS_STORE).clear();
    await transactionDone(transaction);
  }
}

const memoryStorage = new MemoryTimingQueueStorage();

let indexedDbStorage: Promise<TimingQueueStorage> | undefined;

/**
 * Opens the outbox once per runtime and reuses the connection, so several
 * callers share one queue. A failure to open falls back to memory instead of
 * failing the surface.
 */
function resolveStorage(): Promise<TimingQueueStorage> {
  if (indexedDbStorage === undefined) {
    indexedDbStorage = openStorage();
  }
  return indexedDbStorage;
}

async function openStorage(): Promise<TimingQueueStorage> {
  if (typeof indexedDB === 'undefined' || indexedDB === null) {
    return memoryStorage;
  }
  try {
    return new IndexedDbTimingQueueStorage(await openDatabase());
  } catch (error) {
    console.warn(
      'timingQueue: IndexedDB is unavailable, keeping mutations in memory',
      error,
    );
    return memoryStorage;
  }
}

class TimingOutbox implements TimingQueue {
  public readonly isDurable: boolean;

  constructor(private readonly storage: TimingQueueStorage) {
    this.isDurable = storage.isDurable;
  }

  public async nextSequence(
    attemptId: string,
    workstationInstanceId: string,
  ): Promise<number> {
    return this.storage.nextSequence(attemptId, workstationInstanceId);
  }

  public async lastSequence(
    attemptId: string,
    workstationInstanceId: string,
  ): Promise<number> {
    return this.storage.lastSequence(attemptId, workstationInstanceId);
  }

  public async enqueue(item: TimingQueueItem): Promise<void> {
    await this.storage.put(item);
  }

  public async list(attemptId?: string): Promise<TimingQueueItem[]> {
    const items = await this.storage.all();
    const selected =
      attemptId === undefined
        ? items
        : items.filter((item) => item.attemptId === attemptId);
    return selected.sort(compareItems);
  }

  public async mark(
    id: string,
    status: TimingMutationStatus,
    error?: string,
  ): Promise<void> {
    const item = await this.storage.get(id);
    if (item === undefined) {
      throw new Error(`Timing queue item ${id} is not queued`);
    }
    const next: TimingQueueItem = { ...item, status };
    if (error !== undefined) {
      next.error = error;
    } else if (status !== 'REJECTED') {
      delete next.error;
    }
    await this.storage.put(next);
  }

  public async remove(id: string): Promise<void> {
    await this.storage.delete(id);
  }

  public async pendingCount(attemptId?: string): Promise<number> {
    const items = await this.list(attemptId);
    return items.filter((item) => UNSYNCED_STATUSES.includes(item.status)).length;
  }

  public async clear(): Promise<void> {
    await this.storage.clearMutations();
  }
}

/** Opens the capture-surface outbox and reports the storage it resolved. */
export async function openTimingQueue(): Promise<TimingQueue> {
  const storage = await resolveStorage();
  return new TimingOutbox(storage);
}
