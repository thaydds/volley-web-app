import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { APP_UPDATE_INTERVAL, AppUpdates } from './appUpdates';
function setup() {
  const events = new EventTarget();
  const workers = Object.assign(new EventTarget(), {
    controller: {} as ServiceWorker,
    register: vi.fn(),
  });
  const registration = Object.assign(new EventTarget(), {
    waiting: null as ServiceWorker | null,
    installing: null as ServiceWorker | null,
    update: vi.fn().mockResolvedValue(undefined),
  });
  workers.register.mockResolvedValue(registration);
  const reload = vi.fn();
  const online = vi.fn(() => true);
  const updates = new AppUpdates({
    workers: workers as unknown as ServiceWorkerContainer,
    events,
    visibility: document,
    online,
    reload,
  });
  return { updates, workers, registration, reload, online, events };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-11T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());
it('checks periodically, throttles focus/online events and does nothing offline', async () => {
  const h = setup();
  h.updates.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.workers.register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
  h.events.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(0);
  expect(h.registration.update).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(APP_UPDATE_INTERVAL);
  expect(h.registration.update).toHaveBeenCalledOnce();
  h.online.mockReturnValue(false);
  await vi.advanceTimersByTimeAsync(APP_UPDATE_INTERVAL);
  expect(h.registration.update).toHaveBeenCalledOnce();
  h.online.mockReturnValue(true);
  h.events.dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(0);
  expect(h.registration.update).toHaveBeenCalledTimes(2);
  h.updates.stop();
  await vi.advanceTimersByTimeAsync(APP_UPDATE_INTERVAL);
  expect(h.registration.update).toHaveBeenCalledTimes(2);
});
it('a waiting update never reloads; activation from another tab also preserves this session', async () => {
  const h = setup();
  const worker = { postMessage: vi.fn() } as unknown as ServiceWorker;
  h.registration.waiting = worker;
  await h.updates.check();
  expect(h.updates.snapshot().available).toBe(true);
  expect(h.reload).not.toHaveBeenCalled();
  h.updates.start();
  h.registration.waiting = null;
  h.workers.dispatchEvent(new Event('controllerchange'));
  expect(h.reload).not.toHaveBeenCalled();
  h.updates.apply();
  expect(h.reload).toHaveBeenCalledOnce();
  h.updates.stop();
});
it('only explicit acceptance activates the worker and reloads the consenting tab', async () => {
  const h = setup();
  const worker = { postMessage: vi.fn() };
  h.registration.waiting = worker as unknown as ServiceWorker;
  h.updates.start();
  await vi.advanceTimersByTimeAsync(0);
  h.updates.apply();
  expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  expect(h.reload).not.toHaveBeenCalled();
  h.workers.dispatchEvent(new Event('controllerchange'));
  expect(h.reload).toHaveBeenCalledOnce();
  h.updates.stop();
});
it('network failures retry later without affecting the running app', async () => {
  const h = setup();
  h.workers.register.mockRejectedValueOnce(new Error('offline during registration'));
  h.updates.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.updates.snapshot().error).toContain('Não foi possível verificar');
  expect(h.reload).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(APP_UPDATE_INTERVAL);
  expect(h.workers.register).toHaveBeenCalledTimes(2);
  expect(h.updates.snapshot().error).toBe('');
  h.updates.stop();
});

it('the first install does not announce an update or reload the page', async () => {
  const h = setup();
  h.workers.controller = null as unknown as ServiceWorker;
  h.updates.start();
  await vi.advanceTimersByTimeAsync(0);
  h.workers.dispatchEvent(new Event('controllerchange'));
  expect(h.updates.snapshot().available).toBe(false);
  expect(h.reload).not.toHaveBeenCalled();
  h.updates.stop();
});
it('an ignored activation request times out safely and can be retried', async () => {
  const h = setup();
  const worker = { postMessage: vi.fn() };
  h.registration.waiting = worker as unknown as ServiceWorker;
  h.updates.start();
  await vi.advanceTimersByTimeAsync(0);
  h.updates.apply();
  await vi.advanceTimersByTimeAsync(15000);
  expect(h.updates.snapshot()).toMatchObject({ available: true, applying: false });
  expect(h.updates.snapshot().error).toContain('Não foi possível atualizar');
  expect(h.reload).not.toHaveBeenCalled();
  h.updates.apply();
  expect(worker.postMessage).toHaveBeenCalledTimes(2);
  h.updates.stop();
});
it('unsupported browsers keep the app usable without trying to register a worker', async () => {
  const h = setup();
  const updates = new AppUpdates({
    workers: undefined,
    events: h.events,
    visibility: document,
    online: h.online,
    reload: h.reload,
  });
  updates.start();
  await updates.check(true);
  updates.apply();
  expect(updates.snapshot().supported).toBe(false);
  expect(h.workers.register).not.toHaveBeenCalled();
  expect(h.reload).not.toHaveBeenCalled();
  updates.stop();
});
