import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../shared/client';
import { emptyState, validLocal, type LocalState, type Snapshot } from './domain';
import { LifecycleTransport } from './transport';
import { LifecycleEngine } from './engine';
import { SYNC_INTERVAL } from './polling';

// Model atomic IDB transactions; the browser suite covers the real database/tabs.
vi.mock('./store', () => {
  const states = new Map<string, LocalState>();
  return {
    LocalStore: class {
      constructor(
        readonly scope: string,
        seed: LocalState
      ) {
        if (!states.has(scope)) states.set(scope, structuredClone(seed));
      }
      async read() {
        return structuredClone(states.get(this.scope)!);
      }
      async edit(change: (s: LocalState) => void) {
        const next = structuredClone(states.get(this.scope)!);
        change(next);
        if (!validLocal(next)) throw new Error('invalid_local_state');
        states.set(this.scope, next);
        return structuredClone(next);
      }
    },
  };
});
const snapshot = (): Snapshot => ({
  players: [],
  matches: [],
  archived: [],
  revision: '1',
  syncedAt: new Date().toISOString(),
});
function setup() {
  const transport = new LifecycleTransport(
    `https://test.invalid/${crypto.randomUUID()}`,
    localStorage
  );
  const read = vi.spyOn(transport, 'readState').mockImplementation(async () => snapshot());
  const changed = vi.spyOn(transport, 'changedSince').mockResolvedValue(false);
  const command = vi.spyOn(transport, 'command').mockImplementation(async (c) => ({
    id: c.input.id,
    name: c.input.name,
    version: 1,
    deleted_at: null,
    revision: '2',
  }));
  const engine = new LifecycleEngine(transport);
  return { engine, transport, read, changed, command };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-11T12:00:00Z'));
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('loads initially, skips writes when clean, and probes only the revision when unchanged', async () => {
  const h = setup();
  await h.engine.poll();
  expect(h.read).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(SYNC_INTERVAL - 1);
  await h.engine.poll();
  expect(h.changed).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  await h.engine.poll();
  expect(h.changed).toHaveBeenCalledWith('1');
  expect(h.command).not.toHaveBeenCalled();
  expect(h.read).toHaveBeenCalledOnce();
  expect((await h.engine.store.read()).base?.syncedAt).toBe(new Date().toISOString());
});
it('uploads durable commands only when due and downloads changes from other devices', async () => {
  const h = setup();
  await h.engine.poll();
  await h.engine.append('create_player', { id: crypto.randomUUID(), name: 'Ana' });
  await h.engine.poll();
  expect(h.command).not.toHaveBeenCalled();
  vi.advanceTimersByTime(SYNC_INTERVAL);
  await h.engine.poll();
  expect(h.command).toHaveBeenCalledOnce();
  expect((await h.engine.store.read()).queue).toEqual([]);
  expect(h.read).toHaveBeenCalledTimes(2);
  h.changed.mockResolvedValue(true);
  vi.advanceTimersByTime(SYNC_INTERVAL);
  await h.engine.poll();
  expect(h.read).toHaveBeenCalledTimes(3);
});
it('shares the interval across tabs/reloads and does not overlap a slow request', async () => {
  const h = setup();
  await h.engine.poll();
  await h.engine.append('create_player', { id: crypto.randomUUID(), name: 'Ana' });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = h.command.getMockImplementation()!;
  let started!: () => void;
  const sending = new Promise<void>((resolve) => {
    started = resolve;
  });
  h.command.mockImplementation(async (c) => {
    started();
    await gate;
    return original(c);
  });
  vi.advanceTimersByTime(SYNC_INTERVAL);
  const first = h.engine.poll();
  await sending;
  const other = new LifecycleEngine(h.transport);
  await Promise.all([other.poll(), h.engine.poll()]);
  expect(h.command).toHaveBeenCalledOnce();
  // A local action remains writable while networking is held. It belongs to the next batch.
  await other.append('create_player', { id: crypto.randomUUID(), name: 'Bia' });
  release();
  await first;
  expect((await h.engine.store.read()).queue).toHaveLength(1);
  expect(h.command).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(SYNC_INTERVAL);
  await other.poll();
  expect(h.command).toHaveBeenCalledTimes(2);
});
it('keeps uncertain requests and retries the identical id after five minutes, never tight loops', async () => {
  const h = setup();
  await h.engine.poll();
  await h.engine.append('create_player', { id: crypto.randomUUID(), name: 'Ana' });
  const [saved] = (await h.engine.store.read()).queue;
  h.command.mockRejectedValueOnce(new ApiError(502, 'upstream_unavailable'));
  vi.advanceTimersByTime(SYNC_INTERVAL);
  await expect(h.engine.poll()).rejects.toThrow();
  expect((await h.engine.store.read()).queue[0]).toMatchObject({
    request_id: saved.request_id,
    error: 'uncertain',
  });
  await h.engine.poll();
  expect(h.command).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(SYNC_INTERVAL);
  await h.engine.poll();
  expect(h.command.mock.calls.map(([c]) => c.request_id)).toEqual([
    saved.request_id,
    saved.request_id,
  ]);
  expect((await h.engine.store.read()).queue).toEqual([]);
});
it('offline never sends; conflicts and authorizations require review, even across intervals', async () => {
  const h = setup();
  await h.engine.poll();
  await h.engine.append('create_player', { id: crypto.randomUUID(), name: 'Ana' });
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  vi.advanceTimersByTime(SYNC_INTERVAL);
  await h.engine.poll();
  expect(h.command).not.toHaveBeenCalled();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  h.command.mockRejectedValueOnce(new ApiError(409, 'conflict'));
  await expect(h.engine.poll()).rejects.toThrow();
  vi.advanceTimersByTime(SYNC_INTERVAL);
  await h.engine.poll();
  expect(h.command).toHaveBeenCalledOnce();
  expect((await h.engine.store.read()).queue[0].error).toBe('conflict');
});
it('accepts old local caches and rejects corrupt polling metadata', () => {
  expect(validLocal(emptyState())).toBe(true);
  expect(validLocal({ ...emptyState(), lastAutoSyncAttempt: NaN })).toBe(false);
  expect(validLocal({ ...emptyState(), lastAutoSyncAttempt: -1 })).toBe(false);
});

it('loads a missing base without replaying old intents, so their review stays reachable', async () => {
  const h = setup();
  const legacy = {
    request_id: crypto.randomUUID(),
    action: 'mutate' as const,
    operation: 'archive_match',
    input: { id: crypto.randomUUID(), version: 1 },
  };
  await h.engine.store.edit((state) => {
    state.legacyPending = [legacy];
  });
  await h.engine.poll();
  expect(h.read).toHaveBeenCalledOnce();
  expect(h.command).not.toHaveBeenCalled();
  expect((await h.engine.store.read()).legacyPending).toEqual([legacy]);
  expect((await h.engine.store.read()).base).not.toBeNull();
  vi.advanceTimersByTime(SYNC_INTERVAL);
  await h.engine.poll();
  expect(h.command).not.toHaveBeenCalled();
});
