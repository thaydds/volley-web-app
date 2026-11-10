import { useEffect, useRef, useState } from 'react';
import { LifecycleEngine, lifecycleError } from './engine';
import { LifecycleTransport } from './transport';
import { emptyState, project, type LocalState } from './domain';
const engines = new Map<string, LifecycleEngine>();
function safeStorage(): Storage {
  try {
    return window.localStorage;
  } catch {
    return {
      length: 0,
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      clear: () => {},
      setItem: () => {
        throw new Error('storage_unavailable');
      },
    };
  }
}
function getEngine(url: string) {
  let engine = engines.get(url);
  if (!engine) {
    engine = new LifecycleEngine(new LifecycleTransport(url, safeStorage()));
    engines.set(url, engine);
  }
  return engine;
}
export function useLifecycle(apiUrl: string) {
  const [engine] = useState(() => getEngine(apiUrl));
  const [state, setState] = useState<LocalState>(emptyState);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState('');
  const running = useRef(false);
  const mounted = useRef(true);
  async function reload() {
    const next = await engine.store.read();
    if (mounted.current) setState(next);
    return next;
  }
  useEffect(() => {
    mounted.current = true;
    let live = true;
    const local = () =>
      void engine.store
        .read()
        .then((s) => {
          if (live) setState(s);
        })
        .catch((e) => {
          if (live) setError(lifecycleError(e));
        });
    const unsubscribe = engine.store.subscribe(local);
    const connection = () => setOnline(navigator.onLine);
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    window.addEventListener('focus', local);
    void (async () => {
      try {
        const saved = await engine.store.read();
        if (!live) return;
        setState(saved);
        if (saved.base) setReady(true);
        if (navigator.onLine) await engine.refresh();
        else if (!saved.base) throw new Error('offline_without_cache');
        if (live) {
          setState(await engine.store.read());
          setError('');
        }
      } catch (e) {
        if (live) setError(lifecycleError(e));
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
      mounted.current = false;
      unsubscribe();
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      window.removeEventListener('focus', local);
    };
  }, [engine]);
  useEffect(() => {
    if (!state.lease) return;
    // A crashed/suspended owner must not leave other tabs disabled indefinitely.
    const delay = state.lease.until - Date.now();
    if (delay <= 0) return;
    const timer = window.setTimeout(() => setState((current) => ({ ...current })), delay + 1);
    return () => window.clearTimeout(timer);
  }, [state.lease]);
  async function run<T>(action: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
    if (running.current) return { ok: false };
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const value = await action();
      await reload();
      return { ok: true, value };
    } catch (e) {
      setError(lifecycleError(e));
      await reload().catch(() => {});
      return { ok: false };
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function synchronize() {
    setSyncing(true);
    try {
      return await run(() => engine.retry());
    } finally {
      setSyncing(false);
    }
  }
  async function retryInitial() {
    setReady(false);
    await run(() => engine.refresh());
    setReady(true);
  }
  return {
    engine,
    state,
    data: project(state),
    ready,
    busy,
    syncing,
    online,
    error,
    setError,
    run,
    synchronize,
    retryInitial,
    reload,
    locked: busy || !!state.deactivation || !!(state.lease && state.lease.until > Date.now()),
    pending: state.queue.length + state.legacyPending.length + (state.deactivation ? 1 : 0),
  };
}
