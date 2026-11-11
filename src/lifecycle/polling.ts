export const SYNC_INTERVAL = 5 * 60 * 1000;

/** One wake-up per interval; focus/reconnection only catch up an overdue cycle. */
export function startPolling(
  poll: () => Promise<number>,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
  visibility: Pick<
    Document,
    'addEventListener' | 'removeEventListener' | 'visibilityState'
  > = document
) {
  let stopped = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout>;
  async function wake() {
    if (stopped || running) return;
    clearTimeout(timer);
    running = true;
    let nextAt = Date.now() + SYNC_INTERVAL;
    try {
      nextAt = await poll();
    } finally {
      running = false;
      if (!stopped) timer = setTimeout(() => void wake(), Math.max(1000, nextAt - Date.now()));
    }
  }
  const visible = () => {
    if (visibility.visibilityState === 'visible') void wake();
  };
  target.addEventListener('online', wake);
  target.addEventListener('focus', wake);
  visibility.addEventListener('visibilitychange', visible);
  void wake();
  return () => {
    stopped = true;
    clearTimeout(timer);
    target.removeEventListener('online', wake);
    target.removeEventListener('focus', wake);
    visibility.removeEventListener('visibilitychange', visible);
  };
}
