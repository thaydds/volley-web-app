export interface CloudPlayer {
  id: string;
  name: string;
  version: number;
}
export interface Participant {
  player_id: string;
  name: string;
  side: 'A' | 'B';
  position: number;
}
export interface CloudMatch {
  id: string;
  number: number;
  played_on: string;
  winner: 'A' | 'B' | null;
  version: number;
  participants: Participant[];
}
export interface Standing {
  id: string;
  name: string;
  points: number;
  wins: number;
  losses: number;
}
export interface Snapshot {
  players: CloudPlayer[];
  matches: CloudMatch[];
  archived: CloudMatch[];
  ranking: Standing[];
  syncedAt: string;
}
interface Session {
  access_token: string;
  refresh_token: string;
  expiresAt: number;
}
export interface Pending {
  request_id: string;
  action: 'mutate' | 'import';
  input: Record<string, unknown>;
  operation?: string;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string
  ) {
    super(code);
  }
}
export const emptySnapshot = (): Snapshot => ({
  players: [],
  matches: [],
  archived: [],
  ranking: [],
  syncedAt: '',
});
export const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(v);
const name = (v: unknown): v is string =>
  typeof v === 'string' && [...v].length > 0 && [...v].length <= 30;
export function validPlayer(v: unknown): v is CloudPlayer {
  return isObject(v) && uuid(v.id) && name(v.name) && integer(v.version) && Number(v.version) > 0;
}
export function validGame(v: unknown): v is CloudMatch {
  return (
    isObject(v) &&
    uuid(v.id) &&
    integer(v.number) &&
    Number(v.number) > 0 &&
    integer(v.version) &&
    Number(v.version) > 0 &&
    typeof v.played_on === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.played_on) &&
    (v.winner === null || v.winner === 'A' || v.winner === 'B') &&
    Array.isArray(v.participants) &&
    v.participants.length >= 2 &&
    v.participants.length <= 100 &&
    v.participants.every(
      (p) =>
        isObject(p) &&
        uuid(p.player_id) &&
        name(p.name) &&
        (p.side === 'A' || p.side === 'B') &&
        integer(p.position)
    )
  );
}
export function validStanding(v: unknown): v is Standing {
  return (
    isObject(v) &&
    uuid(v.id) &&
    name(v.name) &&
    integer(v.points) &&
    integer(v.wins) &&
    integer(v.losses)
  );
}
export function validSnapshot(v: unknown): v is Snapshot {
  return (
    isObject(v) &&
    Array.isArray(v.players) &&
    v.players.every(validPlayer) &&
    Array.isArray(v.matches) &&
    v.matches.every(validGame) &&
    Array.isArray(v.archived) &&
    v.archived.every(validGame) &&
    Array.isArray(v.ranking) &&
    v.ranking.every(validStanding) &&
    typeof v.syncedAt === 'string' &&
    Number.isFinite(Date.parse(v.syncedAt))
  );
}
const flights = new WeakMap<Storage, Map<string, Promise<Session>>>();
export class VolleyClient {
  private session: Session | null = null;
  readonly cacheKey: string;
  private sessionKey: string;
  private pendingKey: string;
  constructor(
    readonly url: string,
    readonly storage: Storage,
    private http: typeof fetch = fetch
  ) {
    this.http = http.bind(globalThis);
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' &&
      !(parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname))
    )
      throw new ApiError(0, 'invalid_api_url');
    this.url = url.replace(/\/$/, '');
    const scope = encodeURIComponent(this.url);
    this.cacheKey = `volley-cloud-cache-v1:${scope}`;
    this.sessionKey = `volley-cloud-session-v1:${scope}`;
    this.pendingKey = `volley-cloud-pending-v1:${scope}`;
  }
  private load(key: string): unknown {
    try {
      return JSON.parse(this.storage.getItem(key) ?? 'null');
    } catch {
      return null;
    }
  }
  private save(key: string, value: unknown) {
    this.storage.setItem(key, JSON.stringify(value));
  }
  cache(): Snapshot | null {
    const cache = this.load(this.cacheKey);
    return validSnapshot(cache) ? cache : null;
  }
  cacheSnapshot(snapshot: Snapshot): boolean {
    try {
      this.save(this.cacheKey, snapshot);
      return true;
    } catch {
      return false;
    }
  }
  pending(): Pending[] {
    const data = this.load(this.pendingKey);
    return Array.isArray(data)
      ? data.filter(
          (v): v is Pending =>
            isObject(v) &&
            uuid(v.request_id) &&
            (v.action === 'mutate' || v.action === 'import') &&
            isObject(v.input) &&
            (v.action !== 'mutate' || typeof v.operation === 'string')
        )
      : [];
  }
  private async post(action: string, body: unknown, token?: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.http(`${this.url}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ApiError(0, 'network_error');
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(response.status, 'invalid_response');
    }
    if (!response.ok)
      throw new ApiError(
        response.status,
        isObject(data) && typeof data.error === 'string' ? data.error : 'request_failed'
      );
    return data;
  }
  private async authenticate(force = false): Promise<Session> {
    const saved = this.load(this.sessionKey);
    if (
      isObject(saved) &&
      typeof saved.access_token === 'string' &&
      typeof saved.refresh_token === 'string' &&
      typeof saved.expiresAt === 'number'
    )
      this.session = saved as unknown as Session;
    if (!force && this.session && this.session.expiresAt > Date.now() + 30000) return this.session;
    let perStorage = flights.get(this.storage);
    if (!perStorage) {
      perStorage = new Map();
      flights.set(this.storage, perStorage);
    }
    let flight = perStorage.get(this.url);
    if (!flight) {
      flight = (async () => {
        let data: unknown;
        if (this.session) {
          try {
            data = await this.post('refresh', { refresh_token: this.session.refresh_token });
          } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 401) throw error;
            this.session = null;
          }
        }
        if (!this.session) data = await this.post('session', {});
        if (
          !isObject(data) ||
          typeof data.access_token !== 'string' ||
          typeof data.refresh_token !== 'string' ||
          typeof data.expires_in !== 'number' ||
          data.expires_in <= 0
        )
          throw new ApiError(502, 'invalid_session_response');
        const session = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expiresAt: Date.now() + data.expires_in * 1000,
        };
        this.session = session;
        try {
          this.save(this.sessionKey, session);
        } catch {
          /* Session can be used in memory; no admin credentials are cached. */
        }
        return session;
      })();
      perStorage.set(this.url, flight);
      void flight.finally(() => perStorage!.delete(this.url)).catch(() => {});
    }
    this.session = await flight;
    return this.session;
  }
  private async authenticated(action: string, body: unknown) {
    const session = await this.authenticate();
    try {
      return await this.post(action, body, session.access_token);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const renewed = await this.authenticate(true);
      return this.post(action, body, renewed.access_token);
    }
  }
  async snapshot(): Promise<Snapshot> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const revisions = new Set<string>();
      const read = async (resource: string, validate: (v: unknown) => boolean) => {
        const rows: unknown[] = [];
        for (let offset = 0; offset <= 100000; offset += 200) {
          const data = await this.authenticated('read', { resource, limit: 200, offset });
          if (
            !isObject(data) ||
            !Array.isArray(data.items) ||
            data.items.length > 200 ||
            !data.items.every(validate) ||
            typeof data.revision !== 'string'
          )
            throw new ApiError(502, 'invalid_data');
          revisions.add(data.revision);
          if (revisions.size > 1) throw new ApiError(409, 'snapshot_changed');
          rows.push(...data.items);
          if (data.items.length < 200) return rows;
        }
        throw new ApiError(413, 'history_too_large');
      };
      try {
        const [players, matches, archived, ranking] = await Promise.all([
          read('players', validPlayer),
          read('matches', validGame),
          read('archived_matches', validGame),
          read('ranking', validStanding),
        ]);
        return {
          players: players as CloudPlayer[],
          matches: matches as CloudMatch[],
          archived: archived as CloudMatch[],
          ranking: ranking as Standing[],
          syncedAt: new Date().toISOString(),
        };
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409 || attempt === 2) throw error;
      }
    }
    throw new ApiError(409, 'snapshot_changed');
  }
  async write(
    action: 'mutate' | 'import',
    input: Record<string, unknown>,
    operation?: string
  ): Promise<Record<string, unknown>> {
    const pending = this.pending();
    let request = pending.find(
      (p) =>
        p.action === action &&
        p.operation === operation &&
        JSON.stringify(p.input) === JSON.stringify(input)
    );
    if (!request) {
      if (pending.length) throw new ApiError(0, 'pending_request');
      request = {
        action,
        input,
        request_id: crypto.randomUUID(),
        ...(operation ? { operation } : {}),
      };
      try {
        this.save(this.pendingKey, [request]);
      } catch {
        throw new ApiError(0, 'storage_unavailable');
      }
    }
    return this.sendPending(request);
  }
  private async sendPending(request: Pending): Promise<Record<string, unknown>> {
    const body = {
      request_id: request.request_id,
      input: request.input,
      ...(request.action === 'mutate' ? { operation: request.operation } : {}),
    };
    const clear = () => {
      try {
        this.save(
          this.pendingKey,
          this.pending().filter((p) => p.request_id !== request.request_id)
        );
      } catch {
        /* A retained receipt can safely be replayed. */
      }
    };
    try {
      const response = await this.authenticated(request.action, body);
      if (!isObject(response)) throw new ApiError(502, 'invalid_response');
      if (
        request.action === 'mutate' &&
        (!uuid(response.id) ||
          !integer(response.version) ||
          Number(response.version) < 1 ||
          (request.operation === 'create_match' &&
            (!integer(response.number) || Number(response.number) < 1)))
      )
        throw new ApiError(502, 'invalid_response');
      if (
        request.action === 'import' &&
        ![response.players_added, response.matches_added, response.matches_skipped].every(integer)
      )
        throw new ApiError(502, 'invalid_response');
      clear();
      return response;
    } catch (error) {
      if (error instanceof ApiError && [400, 404, 409].includes(error.status)) clear();
      throw error;
    }
  }
  async resumePending() {
    for (const request of this.pending()) await this.sendPending(request);
  }
}
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'anonymous_sign_in_disabled')
      return 'O acesso automático ainda não foi habilitado no serviço. A configuração precisa ser concluída.';
    if (error.status === 409)
      return 'Os dados mudaram em outro dispositivo. Atualize e confira antes de tentar novamente.';
    if (error.status === 429)
      return 'O limite de acesso foi atingido. Aguarde um pouco antes de tentar novamente.';
    if (error.code === 'storage_unavailable')
      return 'Não foi possível guardar a identificação do envio neste aparelho. Libere o armazenamento antes de salvar.';
    if (error.status === 400)
      return 'Os dados não puderam ser salvos. Confira nomes, data e participantes.';
    if (error.status === 401)
      return 'Não foi possível iniciar a sessão. Tente novamente; se persistir, a configuração de acesso precisa ser revisada.';
  }
  return 'Não foi possível confirmar a operação. Confira sua conexão e tente novamente.';
}
