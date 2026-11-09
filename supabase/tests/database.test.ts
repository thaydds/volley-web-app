// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
const actor = '11111111-1111-4111-8111-111111111111';
let a: string;
let b: string;
let match: string;
const mutation = async (op: string, input: unknown, request = crypto.randomUUID()) => {
  const { rows } = await db.query<{ result: Record<string, unknown> }>(
    'select public.volley_mutate($1, $2::uuid, $3::jsonb) as result',
    [op, request, JSON.stringify(input)]
  );
  return rows[0].result;
};
const read = async (kind: string) =>
  (
    await db.query<{ result: { items: Array<Record<string, unknown>> } }>(
      'select public.volley_read($1) as result',
      [kind]
    )
  ).rows[0].result.items;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to public;
    create function public.rls_auto_enable() returns event_trigger language plpgsql
      security definer as $$ begin end; $$;`);
  await db.exec(
    readFileSync(
      new URL('../migrations/20261109210000_shared_history.sql', import.meta.url),
      'utf8'
    )
  );
}, 30000);
afterAll(async () => {
  await db.close();
});

describe('private storage and fixed RPC contract', () => {
  it('enables RLS everywhere and restricts the administrative event-trigger function', async () => {
    const { rows } = await db.query<{ safe: boolean }>(`select
      not exists (select 1 from pg_tables where schemaname='private' and not rowsecurity)
      and not has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE')
      and not (select rolbypassrls or rolcanlogin from pg_roles where rolname='volley_api_owner')
      as safe`);
    expect(rows[0].safe).toBe(true);
  });
  it('denies anonymous RPC and direct table access for both browser roles', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await expect(db.query('select * from private.players')).rejects.toThrow(/permission denied/);
      await expect(db.query('select * from private.audit_events')).rejects.toThrow(
        /permission denied/
      );
      await expect(db.query('select public.volley_read($1)', ['players'])).rejects.toThrow(
        role === 'anon' ? /permission denied/ : /session_required/
      );
      await db.exec('reset role');
    }
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [actor]);
    await db.exec('set role authenticated');
  });
  it('preserves SQL/HTML/prototype-shaped names as data and enforces names', async () => {
    const player = await mutation('create_player', { name: "'; DROP TABLE players; --" });
    a = String(player.id);
    b = String((await mutation('create_player', { name: '__proto__' })).id);
    expect((await read('players')).map((p) => p.name)).toContain("'; DROP TABLE players; --");
    await expect(mutation('create_player', { name: '   ' })).rejects.toThrow();
    await expect(mutation('create_player', { name: 'x'.repeat(31) })).rejects.toThrow();
    await expect(mutation('create_player', { name: '__PROTO__' })).rejects.toThrow(/duplicate key/);
  });
  it('deduplicates retries and rejects request reuse with a different payload', async () => {
    const request = crypto.randomUUID();
    const first = await mutation('create_player', { name: 'C' }, request);
    expect(await mutation('create_player', { name: 'C' }, request)).toEqual(first);
    await expect(mutation('create_player', { name: 'D' }, request)).rejects.toThrow(
      /request_conflict/
    );
  });
  it('rolls back invalid matches including repeated or absent participants', async () => {
    for (const participants of [
      [],
      [{ player_id: a, side: 'A' }],
      [
        { player_id: a, side: 'A' },
        { player_id: a, side: 'B' },
      ],
      [
        { player_id: a, side: 'A' },
        { player_id: crypto.randomUUID(), side: 'B' },
      ],
      [
        { player_id: a, side: 'C' },
        { player_id: b, side: 'B' },
      ],
    ]) {
      await expect(
        mutation('create_match', { played_on: '2026-11-09', participants })
      ).rejects.toThrow();
    }
    expect(await read('matches')).toEqual([]);
    const created = await mutation('create_match', {
      played_on: '2026-11-09',
      participants: [
        { player_id: a, side: 'A' },
        { player_id: b, side: 'B' },
      ],
    });
    match = String(created.id);
    expect(created.number).toBe(1);
  });
  it('validates winners and detects stale writes', async () => {
    await expect(
      mutation('set_match_winner', { id: match, version: 1, winner: 'C' })
    ).rejects.toThrow(/invalid_winner/);
    await expect(mutation('set_match_winner', { id: match, version: 1 })).rejects.toThrow(
      /invalid_fields/
    );
    const updated = await mutation('set_match_winner', { id: match, version: 1, winner: 'A' });
    expect(updated.version).toBe(2);
    await expect(
      mutation('set_match_winner', { id: match, version: 1, winner: 'B' })
    ).rejects.toThrow(/version_conflict/);
    expect((await read('ranking')).find((p) => p.id === a)?.points).toBe(1);
  });
  it('preserves snapshots and player identity through rename and archival', async () => {
    await mutation('rename_player', { id: a, version: 1, name: 'Renamed' });
    const matches = await read('matches');
    expect(JSON.stringify(matches)).toContain("'; DROP TABLE players; --");
    expect((await read('ranking')).find((p) => p.id === a)?.name).toBe('Renamed');
    await mutation('archive_player', { id: a, version: 2 });
    expect((await read('players')).some((p) => p.id === a)).toBe(false);
    expect((await read('ranking')).find((p) => p.id === a)?.points).toBe(1);
  });
  it('recovers archived matches without losing results or identity', async () => {
    await mutation('archive_match', { id: match, version: 2 });
    expect(await read('matches')).toEqual([]);
    expect((await read('ranking')).find((p) => p.id === b)?.losses).toBe(0);
    await mutation('restore_match', { id: match, version: 3 });
    expect((await read('ranking')).find((p) => p.id === b)?.losses).toBe(1);
    await expect(
      db.query('select public.volley_read($1,$2,$3)', ['players', 201, 0])
    ).rejects.toThrow(/invalid_pagination/);
  });
  it('enforces the write budget and keeps internal audit inaccessible', async () => {
    await db.exec('reset role');
    const audit = await db.query<{ count: number }>(
      'select count(*)::int as count from private.audit_events'
    );
    expect(audit.rows[0].count).toBe(9);
    await db.query('update private.actor_limits set writes=60 where actor_id=$1', [actor]);
    await db.exec('set role authenticated');
    await expect(mutation('create_player', { name: 'Over quota' })).rejects.toThrow(/rate_limit/);
    await expect(db.query('delete from private.matches')).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
  });
});
