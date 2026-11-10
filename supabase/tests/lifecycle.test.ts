// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
let db: PGlite;
let playerA: string;
let playerB: string;
let game: string;
let legacy: string;
const actor = '11111111-1111-4111-8111-111111111111';
async function command(op: string, input: unknown, id = crypto.randomUUID()) {
  return (
    await db.query<{ result: Record<string, unknown> }>(
      'select public.volley_command($1,$2::uuid,$3::jsonb) result',
      [op, id, JSON.stringify(input)]
    )
  ).rows[0].result;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to public;create function public.rls_auto_enable() returns event_trigger language plpgsql security definer as $$begin end;$$;`
  );
  for (const name of readdirSync(new URL('../migrations/', import.meta.url)).sort()) {
    if (!name.endsWith('.sql')) continue;
    if (name.startsWith('20261110163836')) {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
      const create = async (name: string) =>
        (
          await db.query<{ result: { id: string } }>(
            "select public.volley_mutate('create_player',$1,$2) result",
            [crypto.randomUUID(), JSON.stringify({ name })]
          )
        ).rows[0].result.id;
      playerA = await create('André');
      playerB = await create('Lana');
      legacy = (
        await db.query<{ result: { id: string } }>(
          "select public.volley_mutate('create_match',$1,$2) result",
          [
            crypto.randomUUID(),
            JSON.stringify({
              played_on: '2026-11-10',
              participants: [
                { player_id: playerA, side: 'A' },
                { player_id: playerB, side: 'B' },
              ],
            }),
          ]
        )
      ).rows[0].result.id;
      await db.query("select public.volley_mutate('set_match_winner',$1,$2)", [
        crypto.randomUUID(),
        JSON.stringify({ id: legacy, version: 1, winner: 'A' }),
      ]);
    }
    await db.exec(
      `begin;${readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8')}commit;`
    );
  }
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await db.exec('set role authenticated');
}, 30000);
afterAll(async () => {
  await db.close();
});
it('preserves historical identity/results with unknown scores and protects finished rows', async () => {
  const rows = (
    await db.query<{ result: { items: Record<string, unknown>[] } }>(
      "select public.volley_read_lifecycle('matches') result"
    )
  ).rows[0].result.items;
  expect(rows[0]).toMatchObject({
    id: legacy,
    status: 'finished',
    winner: 'A',
    score_a: null,
    legacy_result: true,
  });
  await expect(
    db.query("select public.volley_mutate('archive_match',$1,$2)", [
      crypto.randomUUID(),
      JSON.stringify({ id: legacy, version: 2 }),
    ])
  ).rejects.toThrow(/client_update_required/);
});
it('enforces private data/grants and rejects unauthorised deactivation even via old/direct RPC', async () => {
  await expect(db.query('select * from private.deactivation_policy')).rejects.toThrow(
    /permission denied/
  );
  await expect(command('deactivate_player', { id: playerA, version: 1 })).rejects.toThrow(
    /invalid_command/
  );
  await expect(
    db.query("select public.volley_mutate('archive_player',$1,$2)", [
      crypto.randomUUID(),
      JSON.stringify({ id: playerA, version: 1 }),
    ])
  ).rejects.toThrow(/client_update_required/);
  const result = await db.query<{ result: { error: string } }>(
    'select public.volley_deactivate_player($1,$2,$3) result',
    [crypto.randomUUID(), JSON.stringify({ id: playerA, version: 1 }), 'not-a-production-secret']
  );
  expect(result.rows[0].result.error).toBe('authorization_not_configured');
});
it('starts immutable teams with a stable id and preserves request identity across session changes', async () => {
  game = crypto.randomUUID();
  const request = crypto.randomUUID();
  const input = {
    id: game,
    played_on: '2026-11-10',
    serving_side: 'B',
    participants: [
      { player_id: playerA, side: 'A' },
      { player_id: playerB, side: 'B' },
    ],
  };
  const result = await command('start_match', input, request);
  expect(result).toMatchObject({
    id: game,
    status: 'in_progress',
    serving_side: 'B',
    score_a: null,
    version: 1,
  });
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [crypto.randomUUID()]);
  expect(await command('start_match', input, request)).toEqual(result);
  await expect(command('start_match', { ...input, serving_side: 'A' }, request)).rejects.toThrow(
    /request_conflict/
  );
});
it('validates integer nonnegative scores and rejects tied finalization', async () => {
  for (const score of [-1, 1.5, null, '3'])
    await expect(
      command('save_score', { id: game, version: 1, score_a: score, score_b: 2 })
    ).rejects.toThrow();
  await expect(
    command('finish_match', { id: game, version: 1, score_a: 2, score_b: 2 })
  ).rejects.toThrow(/tied_score/);
  expect(
    await command('save_score', { id: game, version: 1, score_a: 0, score_b: 3 })
  ).toMatchObject({ version: 2, winner: null, score_a: 0 });
  await expect(
    command('save_score', { id: game, version: 1, score_a: 5, score_b: 3 })
  ).rejects.toThrow(/version_conflict/);
});
it('derives the winner and makes finalized results immutable', async () => {
  expect(
    await command('finish_match', { id: game, version: 2, score_a: 21, score_b: 18 })
  ).toMatchObject({ status: 'finished', winner: 'A', version: 3 });
  await expect(
    command('save_score', { id: game, version: 3, score_a: 1, score_b: 4 })
  ).rejects.toThrow(/match_finished/);
  await db.exec('reset role');
  await expect(
    db.query('update private.matches set score_a=1 where id=$1', [game])
  ).rejects.toThrow(/match_finished/);
  await expect(db.query('delete from private.matches where id=$1', [game])).rejects.toThrow(
    /match_finished/
  );
  await db.exec('set role authenticated');
});
it('normalizes names without implicitly merging or reactivating', async () => {
  const id = crypto.randomUUID();
  await command('create_player', { id, name: '  Ana    Maria  ' });
  await expect(
    command('create_player', { id: crypto.randomUUID(), name: 'ANA maria' })
  ).rejects.toThrow(/player_name_exists/);
  await db.exec('reset role');
  await db.query('select private.configure_deactivation_secret($1)', [
    'test-only-secret-never-production',
  ]);
  await db.exec('set role authenticated');
  const request = crypto.randomUUID();
  const input = { id, version: 1 };
  expect(
    (
      await db.query<{ result: { error: string } }>(
        'select public.volley_deactivate_player($1,$2,$3) result',
        [request, JSON.stringify(input), 'wrong-test-value']
      )
    ).rows[0].result.error
  ).toBe('authorization_invalid');
  expect(
    (
      await db.query<{ result: unknown }>(
        'select public.volley_deactivate_player($1,$2,$3) result',
        [request, JSON.stringify(input), 'test-only-secret-never-production']
      )
    ).rows[0].result
  ).toMatchObject({ id, version: 2 });
  await expect(
    command('create_player', { id: crypto.randomUUID(), name: 'Ana Maria' })
  ).rejects.toThrow(/player_name_exists/);
  expect(await command('reactivate_player', { id, version: 2 })).toMatchObject({
    id,
    version: 3,
    deleted_at: null,
  });
  await db.exec('reset role');
  const receipts = JSON.stringify(
    (await db.query('select input,response from private.mutation_receipts')).rows
  );
  expect(receipts).not.toContain('test-only-secret');
  expect(receipts).not.toContain('wrong-test-value');
  await db.exec('set role authenticated');
});
it('commits failed authorization attempt limits, not only accepted writes', async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [crypto.randomUUID()]);
  let error = '';
  for (let i = 0; i < 7; i++)
    error = (
      await db.query<{ result: { error: string } }>(
        'select public.volley_deactivate_player($1,$2,$3) result',
        [crypto.randomUUID(), JSON.stringify({ id: playerA, version: 1 }), 'wrong-test-value']
      )
    ).rows[0].result.error;
  expect(error).toBe('authorization_rate_limit');
});
it('forbids private helpers, direct configuration and participant edits through database permissions', async () => {
  for (const sql of [
    'select private.configure_deactivation_secret($1)',
    "select private.lifecycle_apply('deactivate_player',$1::uuid,'{}'::jsonb)",
  ])
    await expect(db.query(sql, [crypto.randomUUID()])).rejects.toThrow(/permission denied/);
  await db.exec('reset role');
  await expect(
    db.query('update private.match_players set side=$1 where match_id=$2', ['B', game])
  ).rejects.toThrow(/participants_frozen/);
  await expect(
    db.query('delete from private.match_players where match_id=$1', [game])
  ).rejects.toThrow(/participants_frozen/);
  const grants = await db.query<{ allowed: boolean }>(
    "select has_function_privilege('anon','public.volley_command(text,uuid,jsonb)','EXECUTE') allowed"
  );
  expect(grants.rows[0].allowed).toBe(false);
  await db.exec('set role authenticated');
});
it('recovers only an identical accepted receipt without reexecuting unknown legacy writes', async () => {
  const request = crypto.randomUUID();
  const input = { id: crypto.randomUUID(), name: 'Receipt person' };
  await command('create_player', input, request);
  const recover = async (id: string, body: unknown) =>
    (
      await db.query<{ result: { found: boolean } }>(
        'select public.volley_recover_receipt($1,$2,$3) result',
        [id, 'create_player', JSON.stringify(body)]
      )
    ).rows[0].result;
  expect(await recover(request, input)).toEqual({ found: true });
  expect(await recover(crypto.randomUUID(), input)).toEqual({ found: false });
  await expect(recover(request, { ...input, name: 'Different person' })).rejects.toThrow(
    /request_conflict/
  );
});
