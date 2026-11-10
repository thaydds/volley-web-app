import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { emptyState, type LocalState } from './domain';
import { usePresenceSelection } from './usePresenceSelection';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(gates: Promise<void>[] = [], fail = false) {
  let saved: LocalState = { ...emptyState(), presence: [] };
  const onError = vi.fn();
  const edit = vi.fn(async (change: (s: LocalState) => void) => {
    await gates.shift();
    if (fail) throw new Error('storage write failed');
    const next = structuredClone(saved);
    change(next);
    saved = next;
    return next;
  });
  const hook = renderHook(
    ({ locked }) => {
      const [presence, setPresence] = useState<string[]>([]);
      return usePresenceSelection({
        presence,
        locked,
        store: { edit },
        onError,
        reload: async () => {
          setPresence([...saved.presence]);
          return saved;
        },
      });
    },
    { initialProps: { locked: false } }
  );
  return { ...hook, edit, onError, saved: () => saved };
}
describe('immediate local presence', () => {
  it('responds before storage completes, accepts other taps and persists the latest intent', async () => {
    const first = deferred(),
      second = deferred();
    const h = setup([first.promise, second.promise]);
    act(() => h.result.current.toggle('a'));
    expect(h.result.current.presence).toEqual(['a']);
    expect(h.result.current.pending).toBe(true);
    expect(h.saved().presence).toEqual([]);
    act(() => {
      h.result.current.toggle('b');
      h.result.current.toggle('a');
      h.result.current.toggle('a');
    });
    expect(h.result.current.presence.sort()).toEqual(['a', 'b']);
    await act(async () => {
      first.resolve();
    });
    expect(h.result.current.presence.sort()).toEqual(['a', 'b']);
    expect(h.result.current.pending).toBe(true);
    await act(async () => {
      second.resolve();
    });
    await waitFor(() => expect(h.result.current.pending).toBe(false));
    expect(h.saved().presence.sort()).toEqual(['a', 'b']);
    expect(h.edit).toHaveBeenCalledTimes(2);
    expect(h.onError).not.toHaveBeenCalled();
  });
  it('rapid mark/unmark has no stale toggle or lost final selection', async () => {
    const gate = deferred();
    const h = setup([gate.promise]);
    act(() => {
      h.result.current.toggle('a');
      h.result.current.toggle('a');
    });
    expect(h.result.current.presence).toEqual([]);
    await act(async () => {
      gate.resolve();
    });
    await waitFor(() => expect(h.result.current.pending).toBe(false));
    expect(h.saved().presence).toEqual([]);
  });
  it('rolls back optimistic feedback and reports failure when persistence fails', async () => {
    const gate = deferred();
    const h = setup([gate.promise], true);
    act(() => h.result.current.toggle('a'));
    expect(h.result.current.presence).toEqual(['a']);
    await act(async () => {
      gate.resolve();
    });
    await waitFor(() => expect(h.result.current.pending).toBe(false));
    expect(h.result.current.presence).toEqual([]);
    expect(h.saved().presence).toEqual([]);
    expect(h.onError).toHaveBeenCalledOnce();
  });
  it('respects the separate application lock', () => {
    const h = setup();
    h.rerender({ locked: true });
    act(() => h.result.current.toggle('a'));
    expect(h.result.current.presence).toEqual([]);
    expect(h.edit).not.toHaveBeenCalled();
  });
});
