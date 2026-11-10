import { VolleyClient, ApiError, isObject, type Pending } from '../shared/client';
import { validPlayer, validGame, type Snapshot, type Command, type Deactivation } from './domain';
export class LifecycleTransport extends VolleyClient {
  async readState(): Promise<Snapshot> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const revisions = new Set<string>();
      const read = async (resource: string, validate: (v: unknown) => boolean) => {
        const items: unknown[] = [];
        for (let offset = 0; offset <= 100000; offset += 200) {
          const response = await this.authenticated('state', { resource, limit: 200, offset });
          if (
            !isObject(response) ||
            !Array.isArray(response.items) ||
            response.items.length > 200 ||
            !response.items.every(validate) ||
            typeof response.revision !== 'string' ||
            !/^\d+$/.test(response.revision)
          )
            throw new ApiError(502, 'invalid_lifecycle_data');
          revisions.add(response.revision);
          if (revisions.size > 1) throw new ApiError(409, 'snapshot_changed');
          items.push(...response.items);
          if (response.items.length < 200) return items;
        }
        throw new ApiError(413, 'history_too_large');
      };
      try {
        const [players, matches, archived] = await Promise.all([
          read('players', validPlayer),
          read('matches', validGame),
          read('archived_matches', validGame),
        ]);
        return {
          players: players as Snapshot['players'],
          matches: matches as Snapshot['matches'],
          archived: archived as Snapshot['archived'],
          revision: [...revisions][0],
          syncedAt: new Date().toISOString(),
        };
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409 || attempt === 2) throw error;
      }
    }
    throw new ApiError(409, 'snapshot_changed');
  }
  async command(command: Command): Promise<Record<string, unknown>> {
    const result = await this.authenticated('command', {
      request_id: command.request_id,
      operation: command.operation,
      input: command.input,
    });
    const validate =
      command.operation === 'create_player' || command.operation === 'reactivate_player'
        ? validPlayer
        : validGame;
    if (
      !validate(result) ||
      !isObject(result) ||
      typeof result.revision !== 'string' ||
      !/^\d+$/.test(result.revision)
    )
      throw new ApiError(502, 'invalid_response');
    if (
      result.id !== command.input.id ||
      result.version !==
        (command.operation === 'create_player' || command.operation === 'start_match'
          ? 1
          : Number(command.input.version) + 1)
    )
      throw new ApiError(502, 'invalid_response');
    return result;
  }
  async deactivate(request: Deactivation, word: string): Promise<Record<string, unknown>> {
    const result = await this.authenticated('deactivate', {
      request_id: request.request_id,
      input: request.input,
      authorization_word: word,
    });
    if (!validPlayer(result) || !isObject(result) || typeof result.revision !== 'string')
      throw new ApiError(502, 'invalid_response');
    if (
      result.id !== request.input.id ||
      result.version !== request.input.version + 1 ||
      result.deleted_at === null
    )
      throw new ApiError(502, 'invalid_response');
    return result;
  }
  async recoverLegacy(request: Pending): Promise<boolean> {
    const result = await this.authenticated('recover', {
      request_id: request.request_id,
      operation: request.action === 'import' ? 'import_history' : request.operation,
      input: request.input,
    });
    if (!isObject(result) || typeof result.found !== 'boolean')
      throw new ApiError(502, 'invalid_response');
    if (result.found) {
      // An accepted receipt is the only automatic acknowledgement of an old intent.
      this.storage.setItem(
        this.pendingKey,
        JSON.stringify(this.pending().filter((p) => p.request_id !== request.request_id))
      );
    }
    return result.found;
  }
}
