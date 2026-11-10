import { describe, it, expect, vi } from 'vitest';
import { VolleyClient, emptySnapshot, ApiError } from '../../src/shared/client';
import { readLegacy, possibleDuplicate, importBatches, sourceId } from '../../src/shared/legacy';
class MemoryStorage implements Storage {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}
const id = '11111111-1111-4111-8111-111111111111';
const api = 'https://api.example/volley-api';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const player = { id, name: 'Player', version: 1 };
const session = { access_token: 'access', refresh_token: 'refresh', expires_in: 3600 };
describe('cloud client safety and persistence', () => {
  it('shares one anonymous signup across concurrent paged reads without project keys', async () => {
    const http = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).not.toHaveProperty('apikey');
      if (String(input).endsWith('/session')) {
        expect(JSON.parse(String(init?.body))).toEqual({});
        return json(session);
      }
      const body = JSON.parse(String(init?.body));
      return json({ revision: '1', items: body.resource === 'players' ? [player] : [] });
    });
    const client = new VolleyClient(api, new MemoryStorage(), http);
    expect((await client.snapshot()).players).toEqual([player]);
    expect(http.mock.calls.filter(([url]) => String(url).endsWith('/session'))).toHaveLength(1);
  });
  it('fetches every page and refuses mixed revisions instead of caching partial data', async () => {
    const offsets: number[] = [];
    const http = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/session')) return json(session);
      const body = JSON.parse(String(init?.body));
      if (body.resource === 'players') {
        offsets.push(body.offset);
        return json({
          revision: '1',
          items: body.offset === 0 ? Array.from({ length: 200 }, () => player) : [player],
        });
      }
      return json({ revision: '1', items: [] });
    });
    expect(
      (await new VolleyClient(api, new MemoryStorage(), http).snapshot()).players
    ).toHaveLength(201);
    expect(offsets).toEqual([0, 200]);
    const mixed = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith('/session')
        ? json(session)
        : json({
            revision: JSON.parse(String(init?.body)).resource === 'players' ? '1' : '2',
            items: [],
          })
    );
    await expect(
      new VolleyClient(api, new MemoryStorage(), mixed).snapshot()
    ).rejects.toMatchObject({ status: 409 });
  });
  it('preserves the request ID across reload and an expired anonymous session', async () => {
    const storage = new MemoryStorage();
    const requests: string[] = [];
    let saved = false;
    const http = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/session')) return json(session);
      const body = JSON.parse(String(init?.body));
      requests.push(body.request_id);
      if (!saved) {
        saved = true;
        throw new Error('response lost after commit');
      }
      return json({ id, number: 1, version: 1 });
    });
    const first = new VolleyClient(api, storage, http);
    await expect(
      first.write('mutate', { played_on: '2026-11-09', participants: [] }, 'create_match')
    ).rejects.toMatchObject({ status: 0 });
    expect(first.pending()).toHaveLength(1);
    const second = new VolleyClient(api, storage, http);
    await second.resumePending();
    expect(requests[0]).toBe(requests[1]);
    expect(second.pending()).toEqual([]);
  });
  it('does not send new mutations while an uncertain request exists', async () => {
    const http = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/session') ? json(session) : Promise.reject(new Error('offline'))
    );
    const client = new VolleyClient(api, new MemoryStorage(), http);
    await expect(client.write('mutate', { name: 'A' }, 'create_player')).rejects.toBeInstanceOf(
      ApiError
    );
    const calls = http.mock.calls.length;
    await expect(client.write('mutate', { name: 'B' }, 'create_player')).rejects.toMatchObject({
      code: 'pending_request',
    });
    expect(http).toHaveBeenCalledTimes(calls);
  });
  it('clears a rejected edit but retains malformed success responses for safe reconciliation', async () => {
    const http = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/session') ? json(session) : json({ error: 'conflict' }, 409)
    );
    const client = new VolleyClient(api, new MemoryStorage(), http);
    await expect(
      client.write('mutate', { id, version: 1, winner: 'A' }, 'set_match_winner')
    ).rejects.toMatchObject({ status: 409 });
    expect(client.pending()).toEqual([]);
    const bad = new VolleyClient(api, new MemoryStorage(), async (input) =>
      String(input).endsWith('/session') ? json(session) : json({})
    );
    await expect(bad.write('mutate', { name: 'A' }, 'create_player')).rejects.toMatchObject({
      code: 'invalid_response',
    });
    expect(bad.pending()).toHaveLength(1);
  });
  it('retains a valid cache through invalid storage data and scopes it by API', () => {
    const storage = new MemoryStorage();
    const client = new VolleyClient(api, storage);
    const data = { ...emptySnapshot(), players: [player], syncedAt: new Date().toISOString() };
    expect(client.cacheSnapshot(data)).toBe(true);
    expect(client.cache()?.players).toEqual([player]);
    expect(new VolleyClient('https://other.example/api', storage).cache()).toBe(null);
    storage.setItem(client.cacheKey, '{"players":[]}');
    expect(client.cache()).toBe(null);
  });
  it('refuses to send a write if its retry identity cannot be persisted', async () => {
    const storage = new MemoryStorage();
    storage.setItem = () => {
      throw new Error('quota');
    };
    const http = vi.fn();
    await expect(
      new VolleyClient(api, storage, http).write('mutate', { name: 'A' }, 'create_player')
    ).rejects.toMatchObject({ code: 'storage_unavailable' });
    expect(http).not.toHaveBeenCalled();
  });
  it('preserves Auth 429 and does not loop anonymous signup retries', async () => {
    const http = vi.fn(async () => json({ error: 'session_unavailable' }, 429));
    await expect(new VolleyClient(api, new MemoryStorage(), http).snapshot()).rejects.toMatchObject(
      { status: 429 }
    );
    expect(http).toHaveBeenCalledTimes(1);
  });
});
describe('legacy preview and import batching', () => {
  it('preserves the original while flagging invalid data and dates', () => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify({
      players: [{ name: 'A' }],
      matches: [{ number: 1, date: '31/02/2026', teamA: ['A'], teamB: ['B'], winner: null }],
    });
    storage.setItem('volley-v1', raw);
    const legacy = readLegacy(storage)!;
    expect(legacy.games).toHaveLength(0);
    expect(legacy.problems).toHaveLength(1);
    expect(storage.getItem('volley-v1')).toBe(raw);
  });
  it('flags possible duplicates even when the old numbers or team ordering differ', () => {
    const game = {
      key: '1',
      number: 1,
      played_on: '2026-11-01',
      winner: null,
      team_a: ['A'],
      team_b: ['B'],
    };
    expect(
      possibleDuplicate(game, [
        {
          id,
          number: 99,
          played_on: game.played_on,
          version: 1,
          winner: 'A',
          participants: [
            { player_id: id, name: 'B', side: 'A', position: 0 },
            { player_id: id, name: 'A', side: 'B', position: 0 },
          ],
        },
      ])
    ).toBe(true);
  });
  it('splits large UTF-8 imports without losing any selected record and keeps one device identity', () => {
    const storage = new MemoryStorage();
    const source = sourceId(storage);
    expect(sourceId(storage)).toBe(source);
    const games = Array.from({ length: 500 }, (_, i) => ({
      key: `match-${i}`,
      number: i,
      played_on: '2026-11-01',
      winner: null,
      team_a: ['Á'.repeat(30)],
      team_b: ['É'.repeat(30)],
    }));
    const batches = importBatches(
      { raw: '', players: ['A', 'B'], games, problems: [] },
      new Set(games.map((g) => g.key)),
      source
    );
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flatMap((b) => b.matches as unknown[])).toHaveLength(500);
    expect(
      batches.every((b) => new TextEncoder().encode(JSON.stringify(b)).byteLength < 32768)
    ).toBe(true);
  });
});
