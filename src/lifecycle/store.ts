import { ApiError } from '../shared/client';
import { emptyState, validLocal, type LocalState } from './domain';

/** One read/write transaction stores both data and intent, including across tabs. */
export class LocalStore {
  private database: Promise<IDBDatabase>;
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;
  constructor(
    readonly scope: string,
    private seed: LocalState = emptyState()
  ) {
    this.database = new Promise((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open('volley-lifecycle-v2', 1);
      } catch {
        reject(new ApiError(0, 'storage_unavailable'));
        return;
      }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('states'))
          request.result.createObjectStore('states');
      };
      request.onerror = () => reject(new ApiError(0, 'storage_unavailable'));
      request.onblocked = () => reject(new ApiError(0, 'storage_blocked'));
      request.onsuccess = () => resolve(request.result);
    });
    void this.database.catch(() => {});
    try {
      this.channel = new BroadcastChannel(`volley-lifecycle:${scope}`);
      this.channel.onmessage = () => this.notify();
    } catch {
      /* Reads remain durable even without cross-tab notifications. */
    }
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private notify() {
    this.listeners.forEach((listener) => listener());
  }
  async read(): Promise<LocalState> {
    const db = await this.database;
    return new Promise((resolve, reject) => {
      const request = db.transaction('states', 'readonly').objectStore('states').get(this.scope);
      request.onerror = () => reject(new ApiError(0, 'storage_unavailable'));
      request.onsuccess = () => {
        if (request.result === undefined) {
          resolve(structuredClone(this.seed));
          return;
        }
        if (!validLocal(request.result)) {
          reject(new ApiError(0, 'storage_corrupt'));
          return;
        }
        resolve(request.result);
      };
    });
  }
  async edit(change: (state: LocalState) => void): Promise<LocalState> {
    const db = await this.database;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('states', 'readwrite', { durability: 'strict' });
      const objectStore = transaction.objectStore('states');
      let state: LocalState;
      transaction.onabort = () => reject(new ApiError(0, 'storage_unavailable'));
      transaction.onerror = () => reject(new ApiError(0, 'storage_unavailable'));
      transaction.oncomplete = () => {
        this.notify();
        this.channel?.postMessage('changed');
        resolve(state);
      };
      const request = objectStore.get(this.scope);
      request.onsuccess = () => {
        try {
          if (request.result !== undefined && !validLocal(request.result))
            throw new ApiError(0, 'storage_corrupt');
          state = request.result === undefined ? structuredClone(this.seed) : request.result;
          change(state);
          if (!validLocal(state)) throw new ApiError(0, 'invalid_local_state');
          objectStore.put(state, this.scope);
        } catch (error) {
          transaction.abort();
          reject(error instanceof ApiError ? error : new ApiError(0, 'storage_unavailable'));
        }
      };
    });
  }
  async rawBackup(): Promise<unknown> {
    const db = await this.database;
    return new Promise((resolve, reject) => {
      const r = db.transaction('states').objectStore('states').get(this.scope);
      r.onsuccess = () => resolve(r.result ?? this.seed);
      r.onerror = () => reject(new ApiError(0, 'storage_unavailable'));
    });
  }
  async close() {
    this.channel?.close();
    (await this.database).close();
  }
}
