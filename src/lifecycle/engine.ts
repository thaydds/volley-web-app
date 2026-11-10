import { ApiError, errorMessage } from '../shared/client';
import { LocalStore } from './store';
import { LifecycleTransport } from './transport';
import {
  emptyState,
  project,
  validCommand,
  validPlayer,
  validGame,
  discardedDependents,
  canonicalName,
  type LocalState,
  type Command,
  type Player,
  type Game,
  type Deactivation,
} from './domain';

export function lifecycleError(error: unknown): string {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      authorization_invalid: 'Palavra-chave incorreta. Confira e tente novamente.',
      authorization_rate_limit: 'Muitas tentativas. Aguarde um minuto antes de tentar novamente.',
      authorization_not_configured:
        'A autorização de desativação ainda não foi configurada no serviço.',
      storage_corrupt:
        'Os dados locais precisam de recuperação. Exporte o backup antes de continuar.',
      storage_unavailable:
        'Não foi possível guardar os dados neste aparelho. Libere espaço e tente novamente.',
      storage_blocked: 'Feche outras abas antigas do app e tente novamente.',
      sync_running: 'Outra aba está sincronizando. Aguarde para continuar.',
      offline: 'Sem conexão. Suas alterações locais estão preservadas.',
      pending_deactivation: 'Confirme o envio de desativação antes de continuar.',
      conflict: 'Os dados mudaram em outro dispositivo. Revise o conflito antes de sincronizar.',
      legacy_pending: 'Há um envio antigo que precisa ser revisado. O backup foi preservado.',
      not_found:
        'O serviço ainda não oferece esta versão da API. Suas alterações estão preservadas.',
      entity_not_found: 'O registro não está mais disponível. Revise as alterações pendentes.',
      queue_full: 'Há muitas alterações pendentes. Sincronize antes de continuar.',
    };
    if (messages[error.code]) return messages[error.code];
  }
  return errorMessage(error);
}
export function legacySeed(client: LifecycleTransport): LocalState {
  const state = emptyState();
  const old = client.cache();
  state.legacyPending = client.pending();
  try {
    const saved: unknown = JSON.parse(
      client.storage.getItem(`volley-presence-v1:${encodeURIComponent(client.url)}`) ?? '{}'
    );
    if (saved && typeof saved === 'object')
      state.presence = Object.entries(saved)
        .filter(
          ([id, present]) =>
            /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id) && present === true
        )
        .map(([id]) => id);
  } catch {
    /* Original presence/cache remain untouched. */
  }
  if (old) {
    const game = (m: (typeof old.matches)[number]): Game => ({
      ...m,
      status: m.winner ? 'finished' : 'in_progress',
      score_a: null,
      score_b: null,
      serving_side: null,
      legacy_result: true,
      deleted_at: null,
    });
    state.base = {
      players: old.players.map((p) => ({ ...p, deleted_at: null })),
      matches: old.matches.map(game),
      archived: old.archived.map(game),
      syncedAt: old.syncedAt,
      revision: '0',
    };
  }
  return state;
}
function newer(a: string, b: string) {
  return BigInt(a) >= BigInt(b);
}
function accept(state: LocalState, result: Record<string, unknown>) {
  if (!state.base) throw new ApiError(0, 'not_loaded');
  const upsert = <T extends { id: string; version: number }>(items: T[], value: T) => {
    const current = items.findIndex((p) => p.id === value.id);
    if (current < 0) items.push(value);
    else if (items[current].version <= value.version) items[current] = value;
  };
  if (validPlayer(result)) upsert(state.base.players, result as Player);
  else if (validGame(result)) {
    const game = result as Game;
    upsert(game.deleted_at ? state.base.archived : state.base.matches, game);
  } else throw new ApiError(502, 'invalid_response');
  if (typeof result.revision === 'string' && newer(result.revision, state.base.revision))
    state.base.revision = result.revision;
}
export class LifecycleEngine {
  readonly owner = crypto.randomUUID();
  readonly store: LocalStore;
  constructor(readonly transport: LifecycleTransport) {
    this.store = new LocalStore(transport.url, legacySeed(transport));
  }
  async append(operation: Command['operation'], input: Command['input']) {
    const command: Command = {
      request_id: crypto.randomUUID(),
      operation,
      input,
      createdAt: new Date().toISOString(),
    };
    if (!validCommand(command)) throw new ApiError(400, 'invalid_command');
    await this.store.edit((state) => {
      if (state.lease && state.lease.until > Date.now()) throw new ApiError(0, 'sync_running');
      if (state.deactivation) throw new ApiError(0, 'pending_deactivation');
      if (state.queue.length >= 5000) throw new ApiError(0, 'queue_full');
      const data = project(state);
      if (!data) throw new ApiError(0, 'not_loaded');
      if (
        operation === 'create_player' &&
        data.players.some((p) => canonicalName(p.name) === canonicalName(String(input.name)))
      )
        throw new ApiError(409, 'player_name_exists');
      if (operation === 'start_match') {
        const participants = input.participants as { player_id: string; side: string }[];
        if (
          !participants.some((p) => p.side === 'A') ||
          !participants.some((p) => p.side === 'B') ||
          participants.some(
            (p) => !data.players.some((player) => player.id === p.player_id && !player.deleted_at)
          )
        )
          throw new ApiError(409, 'roster_changed');
      }
      if (operation === 'save_score' || operation === 'finish_match') {
        const game = data.matches.find((m) => m.id === input.id);
        if (!game || game.status === 'finished' || game.version !== input.version)
          throw new ApiError(409, 'match_finished');
      }
      if (operation === 'reactivate_player') {
        const player = data.players.find((p) => p.id === input.id);
        if (!player || !player.deleted_at || player.version !== input.version)
          throw new ApiError(409, 'roster_changed');
      }
      state.queue.push(command);
      if (operation === 'start_match') state.draft = null;
    });
    return String(input.id);
  }
  async refresh() {
    const remote = await this.transport.readState();
    await this.store.edit((state) => {
      if (!state.base || newer(remote.revision, state.base.revision)) state.base = remote;
    });
  }
  private async lease() {
    await this.store.edit((state) => {
      if (state.lease && state.lease.owner !== this.owner && state.lease.until > Date.now())
        throw new ApiError(0, 'sync_running');
      state.lease = { owner: this.owner, until: Date.now() + 60000 };
    });
  }
  private async unlock() {
    await this.store.edit((state) => {
      if (state.lease?.owner === this.owner) state.lease = null;
    });
  }
  async synchronize() {
    if (!navigator.onLine) throw new ApiError(0, 'offline');
    await this.lease();
    try {
      for (;;) {
        await this.lease();
        const state = await this.store.read();
        if (state.legacyPending.length) throw new ApiError(0, 'legacy_pending');
        if (state.deactivation) throw new ApiError(0, 'pending_deactivation');
        const command = state.queue[0];
        if (!command) break;
        if (command.error)
          throw new ApiError(command.error === 'conflict' ? 409 : 400, command.error);
        let result: Record<string, unknown>;
        try {
          result = await this.transport.command(command);
        } catch (error) {
          await this.store.edit((current) => {
            const pending = current.queue.find((c) => c.request_id === command.request_id);
            if (pending)
              pending.error =
                error instanceof ApiError &&
                ['conflict', 'entity_not_found', 'invalid_command', 'invalid_data'].includes(
                  error.code
                )
                  ? error.status === 409
                    ? 'conflict'
                    : 'invalid_command'
                  : 'uncertain';
          });
          throw error;
        }
        await this.store.edit((current) => {
          if (!current.queue.some((c) => c.request_id === command.request_id)) return;
          accept(current, result);
          current.queue = current.queue.filter((c) => c.request_id !== command.request_id);
        });
      }
      await this.refresh();
    } finally {
      await this.unlock();
    }
  }
  async retry() {
    await this.store.edit((state) => {
      const head = state.queue[0];
      if (head?.error === 'uncertain') delete head.error;
    });
    return this.synchronize();
  }
  async useServer(requestId: string) {
    // Read successfully before discarding anything; an unavailable server never loses intent.
    const remote = await this.transport.readState();
    await this.store.edit((state) => {
      if (state.lease && state.lease.until > Date.now()) throw new ApiError(0, 'sync_running');
      const rejected = discardedDependents(state.queue, requestId);
      const ids = new Set(rejected.map((c) => c.request_id));
      state.queue = state.queue.filter((c) => !ids.has(c.request_id));
      if (!state.base || newer(remote.revision, state.base.revision)) state.base = remote;
      const active = new Set(
        project(state)!
          .players.filter((p) => !p.deleted_at)
          .map((p) => p.id)
      );
      state.presence = state.presence.filter((id) => active.has(id));
      if (state.draft && [...state.draft.A, ...state.draft.B].some((id) => !active.has(id)))
        state.draft = null;
    });
  }
  async deactivate(id: string, word: string) {
    if (!navigator.onLine) throw new ApiError(0, 'offline');
    await this.lease();
    try {
      let request: Deactivation | null = null;
      await this.store.edit((state) => {
        if (state.queue.length || state.legacyPending.length)
          throw new ApiError(0, 'pending_request');
        const player = state.base?.players.find((p) => p.id === id);
        if (!player) throw new ApiError(404, 'not_found');
        if (state.deactivation && state.deactivation.input.id !== id)
          throw new ApiError(0, 'pending_deactivation');
        request = state.deactivation ?? {
          request_id: crypto.randomUUID(),
          input: { id, version: player.version },
          uncertain: false,
        };
        state.deactivation = request;
      });
      let result: Record<string, unknown>;
      try {
        result = await this.transport.deactivate(request!, word);
      } catch (error) {
        await this.store.edit((state) => {
          if (state.deactivation)
            state.deactivation.uncertain = !(
              error instanceof ApiError &&
              [
                'authorization_invalid',
                'authorization_rate_limit',
                'authorization_not_configured',
                'conflict',
                'entity_not_found',
                'invalid_authorization_request',
              ].includes(error.code)
            );
        });
        throw error;
      }
      await this.store.edit((state) => {
        accept(state, result);
        state.deactivation = null;
        state.presence = state.presence.filter((p) => p !== id);
      });
      // The validated acknowledgement is durable. Refresh unrelated records on manual sync.
    } finally {
      await this.unlock();
    }
  }
  async cancelDeactivation() {
    await this.store.edit((state) => {
      if (state.deactivation && !state.deactivation.uncertain) state.deactivation = null;
    });
  }
  async backup() {
    const original: Record<string, string | null> = {};
    for (let i = 0; i < this.transport.storage.length; i++) {
      const key = this.transport.storage.key(i);
      if (
        key &&
        (key === 'volley-v1' ||
          key.startsWith('volley-cloud-pending-v1:') ||
          key.startsWith('volley-cloud-cache-v1:'))
      )
        original[key] = this.transport.storage.getItem(key);
    }
    return { exportedAt: new Date().toISOString(), state: await this.store.rawBackup(), original };
  }
  async recoverLegacy() {
    // Never resend a v1 write: recover only its already accepted receipt.
    const state = await this.store.read();
    for (const request of state.legacyPending) {
      const result = await this.transport.recoverLegacy(request);
      if (!result) throw new ApiError(409, 'legacy_pending');
      await this.store.edit((current) => {
        current.legacyPending = current.legacyPending.filter(
          (p) => p.request_id !== request.request_id
        );
      });
    }
    await this.refresh();
  }
  async discardLegacy() {
    await this.store.edit((state) => {
      state.legacyPending = [];
    });
  }
}
