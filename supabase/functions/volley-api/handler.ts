export interface ApiConfig {
  supabaseUrl: string;
  supabaseKey: string;
  allowedOrigin: string;
}

type Json = Record<string, unknown>;
const operations: Record<string, string[]> = {
  create_player: ['name'],
  rename_player: ['id', 'version', 'name'],
  archive_player: ['id', 'version'],
  restore_player: ['id', 'version'],
  create_match: ['played_on', 'participants'],
  set_match_winner: ['id', 'version', 'winner'],
  archive_match: ['id', 'version'],
  restore_match: ['id', 'version'],
};

function object(value: unknown): value is Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function keys(value: Json, expected: string[]): boolean {
  return (
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)
  );
}

function validMutation(body: Json): boolean {
  if (
    !keys(body, ['operation', 'request_id', 'input']) ||
    typeof body.operation !== 'string' ||
    !Object.hasOwn(operations, body.operation) ||
    !uuid(body.request_id) ||
    !object(body.input)
  )
    return false;
  const input = body.input;
  if (!keys(input, operations[body.operation])) return false;
  if (
    'name' in input &&
    (typeof input.name !== 'string' ||
      [...input.name.trim()].length < 1 ||
      [...input.name.trim()].length > 30)
  )
    return false;
  if (
    'id' in input &&
    (!uuid(input.id) || !Number.isSafeInteger(input.version) || Number(input.version) < 1)
  )
    return false;
  if ('winner' in input && input.winner !== null && input.winner !== 'A' && input.winner !== 'B')
    return false;
  if (body.operation === 'create_match') {
    if (
      typeof input.played_on !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.played_on) ||
      !Array.isArray(input.participants) ||
      input.participants.length < 2 ||
      input.participants.length > 100
    )
      return false;
    if (
      !input.participants.every(
        (p) =>
          object(p) &&
          keys(p, ['player_id', 'side']) &&
          uuid(p.player_id) &&
          (p.side === 'A' || p.side === 'B')
      )
    )
      return false;
    const participants = input.participants as Array<{ player_id: string; side: string }>;
    if (
      new Set(participants.map((p) => p.player_id.toLowerCase())).size !== participants.length ||
      !participants.some((p) => p.side === 'A') ||
      !participants.some((p) => p.side === 'B')
    )
      return false;
  }
  return true;
}

// Bound actual streamed bytes, not the untrusted Content-Length header.
async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json') || !request.body)
    throw new Error('invalid_body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 32768) {
      await reader.cancel();
      throw new Error('body_too_large');
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
}

export function createHandler(config: ApiConfig, http: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Origin',
    };
    if (origin === config.allowedOrigin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    }
    const reply = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), { status, headers });
    if (origin && origin !== config.allowedOrigin) return reply(403, { error: 'origin_denied' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    if (!config.supabaseKey || !config.supabaseUrl || !config.allowedOrigin)
      return reply(503, { error: 'not_configured' });

    const upstream = (path: string, body?: unknown, token?: string) =>
      http(`${config.supabaseUrl}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          apikey: config.supabaseKey,
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10000),
      });
    try {
      const body = await readBody(request);
      if (!object(body)) return reply(400, { error: 'invalid_body' });
      const action = new URL(request.url).pathname.split('/').pop();
      if (action === 'session' || action === 'refresh') {
        if (action === 'session') {
          if (!keys(body, [])) return reply(400, { error: 'invalid_session_request' });
          // Supabase Auth enforces signup quotas. Do not trust client-supplied IP headers
          // or replace this with a per-process counter in a distributed Edge runtime.
        } else if (
          !keys(body, ['refresh_token']) ||
          typeof body.refresh_token !== 'string' ||
          !body.refresh_token ||
          body.refresh_token.length > 4096
        )
          return reply(400, { error: 'invalid_refresh' });
        const auth =
          action === 'session'
            ? await upstream('/auth/v1/signup', { data: {} })
            : await upstream('/auth/v1/token?grant_type=refresh_token', {
                refresh_token: body.refresh_token,
              });
        const session: unknown = await auth.json();
        if (
          !auth.ok ||
          !object(session) ||
          typeof session.access_token !== 'string' ||
          typeof session.refresh_token !== 'string' ||
          typeof session.expires_in !== 'number'
        )
          return reply(auth.status === 429 ? 429 : 401, { error: 'session_unavailable' });
        return reply(200, {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_in: session.expires_in,
        });
      }
      if (action !== 'read' && action !== 'mutate') return reply(404, { error: 'not_found' });
      const authorization = request.headers.get('authorization') ?? '';
      if (!/^Bearer [A-Za-z0-9._-]+$/.test(authorization) || authorization.length > 8192)
        return reply(401, { error: 'session_required' });
      const token = authorization.slice(7);
      // Online validation: do not merely decode JWT claims or accept a client-supplied user id.
      const userResponse = await upstream('/auth/v1/user', undefined, token);
      const user: unknown = await userResponse.json();
      if (!userResponse.ok || !object(user) || !uuid(user.id))
        return reply(401, { error: 'invalid_session' });
      let result: Response;
      if (action === 'read') {
        if (
          !keys(body, ['resource', 'limit', 'offset']) ||
          !['players', 'matches', 'ranking'].includes(String(body.resource)) ||
          !Number.isInteger(body.limit) ||
          Number(body.limit) < 1 ||
          Number(body.limit) > 200 ||
          !Number.isInteger(body.offset) ||
          Number(body.offset) < 0 ||
          Number(body.offset) > 1000000
        )
          return reply(400, { error: 'invalid_query' });
        result = await upstream(
          '/rest/v1/rpc/volley_read',
          { p_kind: body.resource, p_limit: body.limit, p_offset: body.offset },
          token
        );
      } else {
        if (!validMutation(body)) return reply(400, { error: 'invalid_mutation' });
        result = await upstream(
          '/rest/v1/rpc/volley_mutate',
          { p_operation: body.operation, p_request_id: body.request_id, p_input: body.input },
          token
        );
      }
      const data: unknown = await result.json();
      if (result.ok) return reply(200, data);
      const code = object(data) ? data.code : undefined;
      if (code === '40001' || code === '23505') return reply(409, { error: 'conflict' });
      if (code === 'P0002') return reply(404, { error: 'not_found' });
      if (object(data) && code === 'P0001' && data.message === 'rate_limit')
        return reply(429, { error: 'rate_limit' });
      if (typeof code === 'string' && (code.startsWith('22') || code.startsWith('23')))
        return reply(400, { error: 'invalid_data' });
      return reply(502, { error: 'upstream_error' });
    } catch (error) {
      if (
        error instanceof SyntaxError ||
        (error instanceof Error && error.message === 'invalid_body')
      )
        return reply(400, { error: 'invalid_body' });
      if (error instanceof Error && error.message === 'body_too_large')
        return reply(413, { error: 'body_too_large' });
      // No upstream responses, keys, tokens, SQL details or exception messages in logs/responses.
      return reply(502, { error: 'upstream_unavailable' });
    }
  };
}
