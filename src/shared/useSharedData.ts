import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, emptySnapshot, errorMessage, type VolleyClient, type Snapshot } from './client';
export function useSharedData(client: VolleyClient) {
  const [initial] = useState(() => client.cache());
  const [data, setData] = useState<Snapshot>(initial ?? emptySnapshot());
  const [loaded, setLoaded] = useState(Boolean(initial));
  const [online, setOnline] = useState(navigator.onLine);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(() => client.pending().length > 0);
  const generation = useRef({ id: 0 });
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    if (!navigator.onLine) return;
    const ticket = ++generation.current.id;
    setLoading(true);
    try {
      const snapshot = await client.snapshot();
      if (!mounted.current || generation.current.id !== ticket) return;
      setData(snapshot);
      setLoaded(true);
      setError('');
      setNotice(
        client.cacheSnapshot(snapshot)
          ? ''
          : 'Os dados foram carregados, mas não foi possível guardar uma cópia offline neste aparelho.'
      );
    } catch (error) {
      if (mounted.current && generation.current.id === ticket)
        setError(
          error instanceof ApiError && [401, 409, 429].includes(error.status)
            ? errorMessage(error)
            : 'Não foi possível atualizar os dados. Tente novamente.'
        );
    } finally {
      if (mounted.current && generation.current.id === ticket) setLoading(false);
    }
  }, [client]);
  useEffect(() => {
    mounted.current = true;
    const requests = generation.current;
    const updateOnline = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine && !busyRef.current) void refresh();
    };
    const focus = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && !busyRef.current)
        void refresh();
    };
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    void refresh();
    return () => {
      mounted.current = false;
      ++requests.id;
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [refresh]);
  const run = async (action: () => Promise<void>, recovering = false) => {
    if (busyRef.current || !navigator.onLine || (!recovering && client.pending().length > 0))
      return false;
    busyRef.current = true;
    setBusy(true);
    setError('');
    let saved = false;
    try {
      await action();
      saved = true;
      setNotice('Salvo na base compartilhada.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) await refresh();
      setError(errorMessage(error));
    } finally {
      setPending(client.pending().length > 0);
      busyRef.current = false;
      setBusy(false);
    }
    if (saved) {
      await refresh();
    }
    return saved;
  };
  return {
    data,
    loaded,
    online,
    loading,
    busy,
    error,
    notice,
    pending,
    refresh,
    run,
    readOnly: !online || busy || !loaded || pending,
    resume: () => run(() => client.resumePending(), true),
  };
}
