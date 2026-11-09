-- Run ONLY in the new empty development project before activation.
-- Fixture records are rolled back. Identity sequences can have harmless gaps.
begin;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$ begin
  begin
    perform public.volley_read('players');
    raise exception 'anonymous_read_was_allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from private.players;
    raise exception 'anonymous_table_was_allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin
    perform public.volley_read('players');
    raise exception 'sessionless_read_was_allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from private.audit_events;
    raise exception 'private_audit_was_allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid()::text)::text, true);
set local role authenticated;
do $$
declare
  a uuid;
  b uuid;
  m uuid;
  request_id uuid := gen_random_uuid();
  first_result jsonb;
  result jsonb;
begin
  first_result := public.volley_mutate('create_player',request_id,jsonb_build_object('name', '__volley_SQL_test__'));
  a := (first_result->>'id')::uuid;
  result := public.volley_mutate('create_player',request_id,jsonb_build_object('name', '__volley_SQL_test__'));
  if first_result <> result then raise exception 'retry_not_idempotent'; end if;
  begin
    perform public.volley_mutate('create_player',request_id,jsonb_build_object('name','different'));
    raise exception 'request_reuse_was_allowed';
  exception when serialization_failure then null; end;
  b := (public.volley_mutate('create_player',gen_random_uuid(),jsonb_build_object('name', chr(39) || '; DROP TABLE players; --'))->>'id')::uuid;
  result := public.volley_mutate('create_match',gen_random_uuid(),jsonb_build_object(
    'played_on','2026-11-09','participants',jsonb_build_array(
      jsonb_build_object('player_id',a,'side','A'), jsonb_build_object('player_id',b,'side','B'))));
  m := (result->>'id')::uuid;
  result := public.volley_mutate('set_match_winner',gen_random_uuid(),jsonb_build_object('id',m,'version',1,'winner','A'));
  if (result->>'version')::integer <> 2 then raise exception 'version_not_incremented'; end if;
  begin
    perform public.volley_mutate('set_match_winner',gen_random_uuid(),jsonb_build_object('id',m,'version',1,'winner','B'));
    raise exception 'stale_write_was_allowed';
  exception when serialization_failure then null; end;
  select value into result from jsonb_array_elements(public.volley_read('ranking')->'items') where value->>'id'=a::text;
  if result is null or (result->>'points')::integer <> 1 then raise exception 'ranking_invalid'; end if;
  perform public.volley_mutate('archive_match',gen_random_uuid(),jsonb_build_object('id',m,'version',2));
  if exists(select 1 from jsonb_array_elements(public.volley_read('matches')->'items') where value->>'id'=m::text) then
    raise exception 'archived_match_visible';
  end if;
  perform public.volley_mutate('restore_match',gen_random_uuid(),jsonb_build_object('id',m,'version',3));
  begin
    perform public.volley_mutate('create_match',gen_random_uuid(),jsonb_build_object('played_on','2026-11-09','participants',jsonb_build_array(
      jsonb_build_object('player_id',a,'side','A'),jsonb_build_object('player_id',a,'side','B'))));
    raise exception 'duplicate_player_was_allowed';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
rollback;
select jsonb_build_object('assertions_passed',true,'players',(select count(*) from private.players),
  'matches',(select count(*) from private.matches),'participants',(select count(*) from private.match_players),
  'audit',(select count(*) from private.audit_events),'receipts',(select count(*) from private.mutation_receipts)) as validation;
