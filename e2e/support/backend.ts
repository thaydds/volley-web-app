import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import { createHandler } from '../../supabase/functions/volley-api/handler';
const apiUrl = 'https://xejuimptprhvrjohhqyn.supabase.co/functions/v1/volley-api';
export class Backend {
  private db = new PGlite();
  private sessions = new Map<string, string>();
  private pending = new Set<Promise<void>>();
  private actor = crypto.randomUUID();
  private calls = 0;
  readonly testAuthorizationWord = 'test-only-browser-authorization';
  readGate: Promise<void> | null = null;
  writeGate: Promise<void> | null = null;
  failReads = false;
  dropNextWrite = false;
  private handler = createHandler(
    {
      supabaseUrl: 'https://test.supabase.co',
      supabaseKey: 'only-test-key',
      allowedOrigin: 'http://127.0.0.1:4178',
    },
    async (input, init) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
      if (url.endsWith('/auth/v1/signup')) {
        const token = `token-${crypto.randomUUID()}`;
        const actor = crypto.randomUUID();
        this.sessions.set(token, actor);
        ++this.calls;
        return json({ access_token: token, refresh_token: token, expires_in: 3600 });
      }
      if (url.includes('/auth/v1/token'))
        return this.sessions.has(body.refresh_token)
          ? json({
              access_token: body.refresh_token,
              refresh_token: body.refresh_token,
              expires_in: 3600,
            })
          : json({}, 401);
      const token = (init?.headers as Record<string, string>)?.Authorization?.slice(7);
      const actor = this.sessions.get(token ?? '');
      if (url.endsWith('/auth/v1/user')) return actor ? json({ id: actor }) : json({}, 401);
      if (!actor) return json({}, 401);
      try {
        const result = await this.db.transaction(async (tx) => {
          await tx.query("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({ sub: actor }),
          ]);
          await tx.exec('set local role authenticated');
          if (url.endsWith('/volley_read') || url.endsWith('/volley_read_lifecycle'))
            return (
              await tx.query<{ result: unknown }>(
                url.endsWith('/volley_read_lifecycle')
                  ? 'select public.volley_read_lifecycle($1,$2,$3) as result'
                  : 'select public.volley_read($1,$2,$3) as result',
                [body.p_kind, body.p_limit, body.p_offset]
              )
            ).rows[0].result;
          if (url.endsWith('/volley_import'))
            return (
              await tx.query<{ result: unknown }>(
                'select public.volley_import($1::uuid,$2::jsonb) as result',
                [body.p_request_id, JSON.stringify(body.p_input)]
              )
            ).rows[0].result;
          if (url.endsWith('/volley_command'))
            return (
              await tx.query<{ result: unknown }>(
                'select public.volley_command($1,$2::uuid,$3::jsonb) result',
                [body.p_operation, body.p_request_id, JSON.stringify(body.p_input)]
              )
            ).rows[0].result;
          if (url.endsWith('/volley_deactivate_player'))
            return (
              await tx.query<{ result: unknown }>(
                'select public.volley_deactivate_player($1::uuid,$2::jsonb,$3) result',
                [body.p_request_id, JSON.stringify(body.p_input), body.p_authorization_word]
              )
            ).rows[0].result;
          if (url.endsWith('/volley_recover_receipt'))
            return (
              await tx.query<{ result: unknown }>(
                'select public.volley_recover_receipt($1::uuid,$2,$3::jsonb) result',
                [body.p_request_id, body.p_operation, JSON.stringify(body.p_input)]
              )
            ).rows[0].result;
          if (url.endsWith('/volley_mutate'))
            return (
              await tx.query<{ result: unknown }>(
                'select public.volley_mutate($1,$2::uuid,$3::jsonb) as result',
                [body.p_operation, body.p_request_id, JSON.stringify(body.p_input)]
              )
            ).rows[0].result;
          throw new Error('Unexpected RPC');
        });
        return json(result);
      } catch (error) {
        const e = error as { code?: string; message?: string };
        const status =
          e.code && /^PT[0-9]{3}$/.test(e.code)
            ? Number(e.code.slice(2))
            : e.code?.startsWith('40')
              ? 500
              : e.code === '23505'
                ? 409
                : 400;
        return json({ code: e.code, message: e.message }, status);
      }
    }
  );
  async start() {
    await this.db.exec(
      `create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to public;`
    );
    for (const name of readdirSync('supabase/migrations').sort())
      if (name.endsWith('.sql'))
        await this.db.exec(`begin;${readFileSync(`supabase/migrations/${name}`, 'utf8')}commit;`);
    // Explicitly test-only authorization; no production default exists.
    await this.db.query('select private.configure_deactivation_secret($1)', [
      this.testAuthorizationWord,
    ]);
  }
  async seedPlayers(names: string[]) {
    return this.db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [this.actor]);
      await tx.exec('set local role authenticated');
      const players = [];
      for (const name of names) {
        const result = await tx.query<{ result: { id: string; name: string; version: number } }>(
          "select public.volley_mutate('create_player',$1::uuid,$2::jsonb) as result",
          [crypto.randomUUID(), JSON.stringify({ name })]
        );
        players.push(result.rows[0].result);
      }
      return players;
    });
  }
  async seedLegacy(input: Record<string, unknown>) {
    return this.db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [this.actor]);
      await tx.exec('set local role authenticated');
      await tx.query('select public.volley_import($1::uuid,$2::jsonb)', [
        crypto.randomUUID(),
        JSON.stringify(input),
      ]);
    });
  }
  async route(context: BrowserContext) {
    await context.route(`${apiUrl}/**`, (route) => {
      const operation = (async () => {
        const request = route.request();
        if (request.url().endsWith('/state')) await this.readGate;
        if (request.url().endsWith('/command')) await this.writeGate;

        if (
          this.failReads &&
          (route.request().url().endsWith('/read') || route.request().url().endsWith('/state'))
        ) {
          await route.fulfill({
            status: 502,
            contentType: 'application/json',
            headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4178' },
            body: JSON.stringify({ error: 'upstream_unavailable' }),
          });
          return;
        }
        const response = await this.handler(
          new Request(request.url(), {
            method: request.method(),
            headers: await request.allHeaders(),
            ...(request.method() === 'POST' ? { body: request.postData() ?? '{}' } : {}),
          })
        );
        if (
          this.dropNextWrite &&
          (request.url().endsWith('/mutate') ||
            request.url().endsWith('/command') ||
            request.url().endsWith('/deactivate')) &&
          response.ok
        ) {
          this.dropNextWrite = false;
          await route.abort('failed');
          return;
        }
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: await response.text(),
        });
      })();
      this.pending.add(operation);
      void operation.finally(() => this.pending.delete(operation)).catch(() => {});
      return operation;
    });
  }
  async mutate(operation: string, input: Record<string, unknown>, requestId: string) {
    return this.db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [this.actor]);
      await tx.exec('set local role authenticated');
      return (
        await tx.query<{ result: Record<string, unknown> }>(
          'select public.volley_mutate($1,$2::uuid,$3::jsonb) result',
          [operation, requestId, JSON.stringify(input)]
        )
      ).rows[0].result;
    });
  }
  async command(
    operation: string,
    input: Record<string, unknown>,
    requestId = crypto.randomUUID()
  ) {
    return this.db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [this.actor]);
      await tx.exec('set local role authenticated');
      return (
        await tx.query<{ result: Record<string, unknown> }>(
          'select public.volley_command($1,$2::uuid,$3::jsonb) result',
          [operation, requestId, JSON.stringify(input)]
        )
      ).rows[0].result;
    });
  }
  async players() {
    return (
      await this.db.query<{ id: string; name: string; deleted_at: string | null; version: number }>(
        'select id,name,deleted_at,version from private.players order by name'
      )
    ).rows;
  }
  async matches() {
    return (
      await this.db.query<Record<string, unknown>>(
        'select id,number,status,score_a,score_b,winner,version,serving_side from private.matches order by number'
      )
    ).rows;
  }
  async authorizationConfigured(configured: boolean) {
    if (!configured) await this.db.exec('delete from private.deactivation_policy');
    else
      await this.db.query('select private.configure_deactivation_secret($1)', [
        this.testAuthorizationWord,
      ]);
  }
  get sessionCount() {
    return this.calls;
  }
  async close() {
    await Promise.allSettled([...this.pending]);
    await this.db.close();
  }
}
const byPage = new WeakMap<Page, Backend>();
export const registerBackend = (page: Page, backend: Backend) => byPage.set(page, backend);
export function backendFor(page: Page): Backend {
  const backend = byPage.get(page);
  if (!backend) throw new Error('Missing isolated API fixture');
  return backend;
}
