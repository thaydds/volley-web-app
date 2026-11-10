// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
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
  for (const name of readdirSync(new URL('../migrations/', import.meta.url)).sort()) {
    if (name.endsWith('.sql')) {
      await db.exec('begin');
      await db.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
      await db.exec('commit');
    }
  }
  // Managed Supabase does not let this custom role access the provider auth schema.
  await db.exec('revoke usage on schema auth from volley_api_owner, public');
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
  it('reads the verified JSON JWT claims without provider auth-schema privileges', async () => {
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    await db.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: actor }),
    ]);
    expect((await read('players')).length).toBe(2);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [actor]);
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
    ).rejects.toMatchObject({ code: 'PT409', message: 'version_conflict' });
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

describe('atomic legacy import and consistent cloud reads', () => {
  const source = crypto.randomUUID();
  const request = crypto.randomUUID();
  const payload = {
    source_id: source,
    players: ['Import A', 'Import B'],
    matches: [
      {
        key: 'match-1',
        played_on: '2026-11-01',
        winner: 'A',
        team_a: ['Import A'],
        team_b: ['Import B'],
      },
    ],
  };
  const importData = async (input: unknown, id = crypto.randomUUID()) =>
    (
      await db.query<{ result: Record<string, unknown> }>(
        'select public.volley_import($1::uuid,$2::jsonb) as result',
        [id, JSON.stringify(input)]
      )
    ).rows[0].result;
  it('imports once, replays across sessions and deduplicates source records in later batches', async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [crypto.randomUUID()]);
    await db.exec('set role authenticated');
    const result = await importData(payload, request);
    expect(result).toMatchObject({ players_added: 2, matches_added: 1 });
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [crypto.randomUUID()]);
    expect(await importData(payload, request)).toEqual(result);
    expect(await importData(payload)).toMatchObject({
      players_added: 0,
      matches_added: 0,
      matches_skipped: 1,
    });
    await expect(importData({ ...payload, players: ['Changed'] }, request)).rejects.toThrow(
      /request_conflict/
    );
    expect((await read('ranking')).find((p) => p.name === 'Import A')?.points).toBe(1);
  });
  it('rolls back every record when any match in a batch is invalid', async () => {
    const before = (await read('players')).length;
    await expect(
      importData({
        source_id: crypto.randomUUID(),
        players: ['Rollback A', 'Rollback B'],
        matches: [
          {
            key: 'valid',
            played_on: '2026-11-01',
            winner: null,
            team_a: ['Rollback A'],
            team_b: ['Rollback B'],
          },
          {
            key: 'invalid',
            played_on: '2026-02-31',
            winner: null,
            team_a: ['Rollback A'],
            team_b: ['Rollback B'],
          },
        ],
      })
    ).rejects.toThrow();
    expect((await read('players')).length).toBe(before);
    expect((await read('matches')).some((m) => JSON.stringify(m).includes('Rollback'))).toBe(false);
  });
  it('rejects altered source keys and inaccessible private helpers', async () => {
    await expect(
      importData({ ...payload, matches: [{ ...payload.matches[0], winner: 'B' }] })
    ).rejects.toThrow(/import_record_conflict/);
    await expect(
      db.query('select private.consume_write_budget($1::uuid)', [actor])
    ).rejects.toThrow(/permission denied/);
  });
  it('exposes a monotonic revision for full-history pagination and archived results', async () => {
    const before = (
      await db.query<{ revision: string }>(
        "select public.volley_read('players')->>'revision' as revision"
      )
    ).rows[0].revision;
    const id = crypto.randomUUID();
    const first = await mutation('create_player', { name: 'Global retry' }, id);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [crypto.randomUUID()]);
    expect(await mutation('create_player', { name: 'Global retry' }, id)).toEqual(first);
    const after = (
      await db.query<{ revision: string }>(
        "select public.volley_read('players')->>'revision' as revision"
      )
    ).rows[0].revision;
    expect(BigInt(after)).toBeGreaterThan(BigInt(before));
    expect(await read('archived_matches')).toEqual([]);
    await db.exec('reset role');
  });
});

describe('cross-device duplicate review', () => {
  it('blocks an unreviewed duplicate from another source but permits an explicit override', async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [crypto.randomUUID()]);
    await db.exec('set role authenticated');
    const game = {
      key: 'duplicate',
      played_on: '2026-11-01',
      winner: 'A',
      team_a: ['Import A'],
      team_b: ['Import B'],
    };
    const input = { source_id: crypto.randomUUID(), players: [], matches: [game] };
    const send = (value: unknown) =>
      db.query('select public.volley_import($1::uuid,$2::jsonb)', [
        crypto.randomUUID(),
        JSON.stringify(value),
      ]);
    await expect(send(input)).rejects.toThrow(/possible_duplicate/);
    await send({ ...input, matches: [{ ...game, allow_duplicate: true }] });
    // Repeated games recorded by the same device retain their distinct legacy keys.
    await send({ ...input, matches: [{ ...game, key: 'local-1', played_on: '2026-11-03' }] });
    await send({ ...input, matches: [{ ...game, key: 'local-2', played_on: '2026-11-03' }] });
    await db.exec('reset role');
  });
});
