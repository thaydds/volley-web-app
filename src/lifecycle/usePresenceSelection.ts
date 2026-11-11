import { useRef, useState } from 'react';
import { ApiError } from '../shared/client';
import { lifecycleError } from './engine';
import type { LocalStore } from './store';

type Intent = { id: string; selected: boolean; sequence: number };
type Options = {
  presence: string[];
  locked: boolean;
  store: Pick<LocalStore, 'edit'>;
  reload: () => Promise<unknown>;
  onError: (message: string) => void;
};
const assign = (presence: string[], id: string, selected: boolean) =>
  selected
    ? [...presence.filter((value) => value !== id), id]
    : presence.filter((value) => value !== id);

/** Presence is local UI state, not a cloud mutation or an acknowledged result. */
export function usePresenceSelection(options: Options) {
  const current = useRef(options);
  current.current = options;
  const [overlay, setOverlay] = useState(new Map<string, Intent>());
  const intents = useRef(new Map<string, Intent>());
  const visible = useRef(new Map<string, Intent>());
  const sequence = useRef(0);
  const writing = useRef(false);
  const recovering = useRef(false);
  const [recovery, setRecovery] = useState(false);

  async function persist() {
    if (writing.current) return;
    writing.current = true;
    try {
      while (intents.current.size) {
        const batch = [...intents.current.values()];
        intents.current.clear();
        await current.current.store.edit((state) => {
          if (state.deactivation) throw new ApiError(0, 'sync_running');
          for (const intent of batch)
            state.presence = assign(state.presence, intent.id, intent.selected);
        });
        await current.current.reload();
        for (const intent of batch)
          if (visible.current.get(intent.id)?.sequence === intent.sequence)
            visible.current.delete(intent.id);
        setOverlay(new Map(visible.current));
      }
    } catch (error) {
      recovering.current = true;
      setRecovery(true);
      intents.current.clear();
      // Reconcile partial successful batches before removing optimistic feedback.
      await current.current.reload().catch(() => {});
      visible.current.clear();
      setOverlay(new Map());
      current.current.onError(lifecycleError(error));
      recovering.current = false;
      setRecovery(false);
    } finally {
      writing.current = false;
    }
  }
  function toggle(id: string) {
    if (current.current.locked || recovering.current) return;
    const selected = !(visible.current.get(id)?.selected ?? current.current.presence.includes(id));
    const intent = { id, selected, sequence: ++sequence.current };
    visible.current.set(id, intent);
    intents.current.set(id, intent);
    setOverlay(new Map(visible.current));
    void persist();
  }
  let presence = options.presence;
  for (const intent of overlay.values()) presence = assign(presence, intent.id, intent.selected);
  return { presence, toggle, pending: overlay.size > 0, recovering: recovery };
}
