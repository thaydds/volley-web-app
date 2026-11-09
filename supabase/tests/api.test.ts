import { describe, expect, it, vi } from 'vitest';
import { createHandler, type ApiConfig } from '../functions/volley-api/handler';

const origin = 'https://thaydds.github.io';
const id = '11111111-1111-4111-8111-111111111111';
const config: ApiConfig = {
  supabaseUrl: 'https://test.supabase.co',
  supabaseKey: 'server-only-test-key',
  allowedOrigin: origin,
};
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
function request(action: string, body: unknown, token?: string) {
  return new Request(`https://api.example/volley-api/${action}`, {
    method: 'POST',
    headers: {
      origin,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
describe('keyless browser API', () => {
  it('requires a session before database calls and rejects foreign origins', async () => {
    const http = vi.fn();
    const handler = createHandler(config, http);
    expect((await handler(request('read', {}))).status).toBe(401);
    expect(http).not.toHaveBeenCalled();
    const foreign = request('session', {});
    foreign.headers.set('origin', 'https://evil.example');
    expect((await handler(foreign)).status).toBe(403);
    expect(http).not.toHaveBeenCalled();
  });
  it('rejects unexpected session fields without creating an account', async () => {
    const http = vi.fn();
    const result = await createHandler(config, http)(request('session', { user_id: id }));
    expect(result.status).toBe(400);
    expect(http).not.toHaveBeenCalled();
  });
  it('honors Auth signup and refresh rate limits without retrying or exposing details', async () => {
    for (const [action, body] of [
      ['session', {}],
      ['refresh', { refresh_token: 'token' }],
    ] as const) {
      const http = vi.fn().mockResolvedValueOnce(response({ message: config.supabaseKey }, 429));
      const result = await createHandler(config, http)(request(action, body));
      expect(result.status).toBe(429);
      expect(await result.json()).toEqual({ error: 'session_unavailable' });
      expect(http).toHaveBeenCalledTimes(1);
    }
  });
  it('returns only session tokens, with no project credentials or user metadata', async () => {
    const http = vi.fn().mockResolvedValueOnce(
      response({
        access_token: 'session-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        user: { private: 'hidden' },
        key: config.supabaseKey,
      })
    );
    const result = await createHandler(config, http)(request('session', {}));
    expect(result.status).toBe(200);
    expect(http).toHaveBeenCalledTimes(1);
    expect(http.mock.calls[0][0]).toBe(`${config.supabaseUrl}/auth/v1/signup`);
    expect(JSON.parse(http.mock.calls[0][1].body)).toEqual({ data: {} });
    expect(await result.json()).toEqual({
      access_token: 'session-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
    });
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(result.headers.get('access-control-allow-origin')).toBe(origin);
  });
  it('validates tokens online rather than trusting a decoded user id', async () => {
    const http = vi.fn().mockResolvedValue(response({ error: 'invalid' }, 401));
    const result = await createHandler(
      config,
      http
    )(request('read', { resource: 'players', limit: 100, offset: 0 }, 'forged.jwt.claims'));
    expect(result.status).toBe(401);
    expect(http).toHaveBeenCalledTimes(1);
    expect(http.mock.calls[0][0]).toBe(`${config.supabaseUrl}/auth/v1/user`);
  });
  it('uses fixed RPC names and parameters for quotes and SQL-looking input', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce(response({ id }))
      .mockResolvedValueOnce(response({ id, name: "'; drop table players; --", version: 1 }));
    const result = await createHandler(
      config,
      http
    )(
      request(
        'mutate',
        {
          operation: 'create_player',
          request_id: id,
          input: { name: "'; drop table players; --" },
        },
        'valid.token'
      )
    );
    expect(result.status).toBe(200);
    expect(http.mock.calls[1][0]).toBe(`${config.supabaseUrl}/rest/v1/rpc/volley_mutate`);
    expect(JSON.parse(http.mock.calls[1][1].body)).toEqual({
      p_operation: 'create_player',
      p_request_id: id,
      p_input: { name: "'; drop table players; --" },
    });
  });
  it('rejects unknown operations, forged fields, malformed teams and unbounded reads', async () => {
    const bodies = [
      { operation: '__proto__', request_id: id, input: {} },
      { operation: 'create_player', request_id: id, input: { name: 'A', created_by: id } },
      { operation: 'set_match_winner', request_id: id, input: { id, version: 1, winner: 'C' } },
      {
        operation: 'create_match',
        request_id: id,
        input: {
          played_on: '2026-11-09',
          participants: [
            { player_id: id, side: 'A' },
            { player_id: id, side: 'B' },
          ],
        },
      },
    ];
    for (const body of bodies) {
      const http = vi.fn().mockResolvedValueOnce(response({ id }));
      expect(
        (await createHandler(config, http)(request('mutate', body, 'valid.token'))).status
      ).toBe(400);
      expect(http).toHaveBeenCalledTimes(1);
    }
    const http = vi.fn().mockResolvedValueOnce(response({ id }));
    expect(
      (
        await createHandler(
          config,
          http
        )(request('read', { resource: 'players', limit: 10000, offset: 0 }, 'valid.token'))
      ).status
    ).toBe(400);
  });
  it('bounds streamed bodies even when Content-Length is missing', async () => {
    const http = vi.fn();
    const result = await createHandler(
      config,
      http
    )(request('mutate', { input: 'x'.repeat(32769) }, 'valid.token'));
    expect(result.status).toBe(413);
    expect(http).not.toHaveBeenCalled();
  });
  it('sanitizes upstream failures and maps conflicts and rate limits', async () => {
    for (const [error, status] of [
      [{ code: '40001' }, 409],
      [{ code: 'P0001', message: 'rate_limit' }, 429],
      [{ code: '23514' }, 400],
      [{ code: 'XX000', message: config.supabaseKey, details: 'SQL hidden' }, 502],
    ] as const) {
      const http = vi
        .fn()
        .mockResolvedValueOnce(response({ id }))
        .mockResolvedValueOnce(response(error, 500));
      const result = await createHandler(
        config,
        http
      )(request('read', { resource: 'players', limit: 100, offset: 0 }, 'valid.token'));
      expect(result.status).toBe(status);
      const text = await result.text();
      expect(text).not.toContain(config.supabaseKey);
      expect(text).not.toContain('SQL hidden');
    }
  });
  it('refreshes through the server and never forwards unknown fields', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce(
        response({ access_token: 'new', refresh_token: 'new-refresh', expires_in: 3600 })
      );
    const handler = createHandler(config, http);
    expect((await handler(request('refresh', { refresh_token: 'old' }))).status).toBe(200);
    expect(JSON.parse(http.mock.calls[0][1].body)).toEqual({ refresh_token: 'old' });
    expect(
      (await handler(request('refresh', { refresh_token: 'old', url: 'https://evil.example' })))
        .status
    ).toBe(400);
    expect(http).toHaveBeenCalledTimes(1);
  });
});
