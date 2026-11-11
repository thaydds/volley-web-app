import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startPolling, SYNC_INTERVAL } from './polling';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it('runs once per five minutes, catches up on wake, and removes timers/listeners', async () => {
  const target = new EventTarget();
  const poll = vi.fn(async () => Date.now() + SYNC_INTERVAL);
  const stop = startPolling(poll, target);
  await vi.advanceTimersByTimeAsync(0);
  expect(poll).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(SYNC_INTERVAL - 1);
  expect(poll).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(poll).toHaveBeenCalledTimes(2);
  target.dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(0);
  expect(poll).toHaveBeenCalledTimes(3);
  stop();
  target.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(SYNC_INTERVAL * 2);
  expect(poll).toHaveBeenCalledTimes(3);
});
it('never overlaps a slow cycle and never schedules after unmount', async () => {
  let finish!: (next: number) => void;
  const poll = vi.fn(
    () =>
      new Promise<number>((resolve) => {
        finish = resolve;
      })
  );
  const target = new EventTarget();
  const stop = startPolling(poll, target);
  target.dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(SYNC_INTERVAL * 2);
  expect(poll).toHaveBeenCalledOnce();
  stop();
  finish(Date.now() + SYNC_INTERVAL);
  await vi.advanceTimersByTimeAsync(SYNC_INTERVAL * 2);
  expect(poll).toHaveBeenCalledOnce();
});
