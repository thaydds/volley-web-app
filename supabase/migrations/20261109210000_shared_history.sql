-- Private storage; only the closed RPC contract below is exposed.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create role volley_api_owner nologin noinherit;
grant usage on schema private, public, auth to volley_api_owner;

create table private.players (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_by uuid not null
);
create unique index players_active_name on private.players (lower(name)) where deleted_at is null;

create table private.matches (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  played_on date not null check (played_on between date '1900-01-01' and date '2200-12-31'),
  winner text check (winner in ('A', 'B')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_by uuid not null
);
create index matches_active_number on private.matches (number) where deleted_at is null;

create table private.match_players (
  match_id uuid not null references private.matches(id),
  player_id uuid not null references private.players(id),
  side text not null check (side in ('A', 'B')),
  position integer not null check (position between 0 and 99),
  name_snapshot text not null check (char_length(name_snapshot) between 1 and 30),
  primary key (match_id, player_id),
  unique (match_id, side, position)
);
create index match_players_player on private.match_players (player_id);

create table private.mutation_receipts (
  actor_id uuid not null,
  request_id uuid not null,
  operation text not null,
  input jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, request_id)
);
create table private.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  operation text not null,
  entity_id uuid not null,
  occurred_at timestamptz not null default now(),
  before_data jsonb,
  after_data jsonb not null
);
create table private.actor_limits (
  actor_id uuid primary key,
  window_start timestamptz not null,
  writes integer not null
);

alter table private.players enable row level security;
alter table private.matches enable row level security;
alter table private.match_players enable row level security;
alter table private.mutation_receipts enable row level security;
alter table private.audit_events enable row level security;
alter table private.actor_limits enable row level security;

create policy api_players on private.players to volley_api_owner using (true) with check (true);
create policy api_matches on private.matches to volley_api_owner using (true) with check (true);
create policy api_participants on private.match_players to volley_api_owner using (true) with check (true);
create policy api_receipts on private.mutation_receipts to volley_api_owner using (true) with check (true);
create policy api_audit on private.audit_events to volley_api_owner using (true) with check (true);
create policy api_limits on private.actor_limits to volley_api_owner using (true) with check (true);

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;
grant select, insert, update on private.players, private.matches, private.actor_limits to volley_api_owner;
grant select, insert on private.match_players, private.mutation_receipts, private.audit_events to volley_api_owner;
grant usage on all sequences in schema private to volley_api_owner;

create function public.volley_read(p_kind text, p_limit integer default 100, p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege using message = 'session_required'; end if;
  if p_kind is null or p_limit is null or p_offset is null or p_limit not between 1 and 200 or p_offset not between 0 and 1000000 then
    raise invalid_parameter_value using message = 'invalid_pagination';
  end if;
  case p_kind
  when 'players' then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]') into result from (
      select id, name, version from private.players where deleted_at is null order by id limit p_limit offset p_offset
    ) t;
  when 'matches' then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]') into result from (
      select m.id, m.number, m.played_on, m.winner, m.version,
        (select jsonb_agg(jsonb_build_object('player_id', mp.player_id, 'side', mp.side,
          'position', mp.position, 'name', mp.name_snapshot) order by mp.side, mp.position)
         from private.match_players mp where mp.match_id = m.id) as participants
      from private.matches m where m.deleted_at is null order by m.number desc limit p_limit offset p_offset
    ) t;
  when 'ranking' then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]') into result from (
      select p.id, p.name,
        count(m.id) filter (where m.winner = mp.side) as points,
        count(m.id) filter (where m.winner = mp.side) as wins,
        count(m.id) filter (where m.winner is not null and m.winner <> mp.side) as losses
      from private.players p
      left join private.match_players mp on mp.player_id = p.id
      left join private.matches m on m.id = mp.match_id and m.deleted_at is null
      group by p.id
      having p.deleted_at is null or count(m.id) > 0
      order by points desc, lower(p.name), p.id limit p_limit offset p_offset
    ) t;
  else raise invalid_parameter_value using message = 'invalid_resource';
  end case;
  return jsonb_build_object('items', result, 'limit', p_limit, 'offset', p_offset);
end;
$$;

create function public.volley_mutate(p_operation text, p_request_id uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  receipt private.mutation_receipts%rowtype;
  player private.players%rowtype;
  game private.matches%rowtype;
  previous jsonb;
  result jsonb;
  entity uuid;
  total integer;
  writes integer;
  expected text[];
begin
  if actor is null then raise insufficient_privilege using message = 'session_required'; end if;
  if p_operation is null or p_operation not in ('create_player', 'rename_player', 'archive_player', 'restore_player',
    'create_match', 'set_match_winner', 'archive_match', 'restore_match')
    or p_request_id is null or p_input is null or jsonb_typeof(p_input) <> 'object' or octet_length(p_input::text) > 32768 then
    raise invalid_parameter_value using message = 'invalid_operation';
  end if;
  expected := case p_operation
    when 'create_player' then array['name']
    when 'rename_player' then array['id','version','name']
    when 'create_match' then array['played_on','participants']
    when 'set_match_winner' then array['id','version','winner']
    else array['id','version'] end;
  if not (p_input ?& expected) or p_input - expected <> '{}'::jsonb then
    raise invalid_parameter_value using message = 'invalid_fields';
  end if;
  -- Serializes duplicate requests, including requests arriving concurrently.
  perform pg_advisory_xact_lock(hashtextextended(actor::text || p_request_id::text, 0));
  select * into receipt from private.mutation_receipts where actor_id = actor and request_id = p_request_id;
  if found then
    if receipt.operation <> p_operation or receipt.input <> p_input then
      raise sqlstate '40001' using message = 'request_conflict';
    end if;
    return receipt.response;
  end if;
  insert into private.actor_limits as l (actor_id, window_start, writes) values (actor, date_trunc('minute', now()), 1)
    on conflict (actor_id) do update set
      window_start = excluded.window_start,
      writes = case when l.window_start = excluded.window_start then l.writes + 1 else 1 end
    returning l.writes into writes;
  if writes > 60 then raise sqlstate 'P0001' using message = 'rate_limit'; end if;

  case p_operation
  when 'create_player' then
    if jsonb_typeof(p_input->'name') is distinct from 'string' then
      raise invalid_parameter_value using message = 'invalid_name';
    end if;
    insert into private.players(name, created_by) values (btrim(p_input->>'name'), actor) returning * into player;
    entity := player.id;
    result := jsonb_build_object('id', player.id, 'name', player.name, 'version', player.version);
  when 'rename_player', 'archive_player', 'restore_player' then
    select * into player from private.players where id = (p_input->>'id')::uuid for update;
    if not found then raise no_data_found using message = 'not_found'; end if;
    if (p_input->>'version')::integer is distinct from player.version then
      raise sqlstate '40001' using message = 'version_conflict';
    end if;
    previous := to_jsonb(player) - 'created_by';
    if p_operation = 'rename_player' and (player.deleted_at is not null or jsonb_typeof(p_input->'name') is distinct from 'string') then
      raise invalid_parameter_value using message = 'invalid_name';
    end if;
    update private.players set
      name = case when p_operation = 'rename_player' then btrim(p_input->>'name') else name end,
      deleted_at = case when p_operation = 'archive_player' then now() when p_operation = 'restore_player' then null else deleted_at end,
      version = version + 1, updated_at = now()
      where id = player.id returning * into player;
    entity := player.id;
    result := jsonb_build_object('id', player.id, 'name', player.name, 'version', player.version, 'deleted_at', player.deleted_at);
  when 'create_match' then
    if jsonb_typeof(p_input->'participants') is distinct from 'array' then
      raise invalid_parameter_value using message = 'invalid_participants';
    end if;
    total := jsonb_array_length(p_input->'participants');
    if total not between 2 and 100 or exists (
      select 1 from jsonb_array_elements(p_input->'participants') x
      where jsonb_typeof(x) <> 'object' or x - array['player_id','side'] <> '{}'::jsonb
        or x->>'side' is null or x->>'side' not in ('A','B') or x->>'player_id' is null
    ) or not exists (select 1 from jsonb_array_elements(p_input->'participants') x where x->>'side' = 'A')
      or not exists (select 1 from jsonb_array_elements(p_input->'participants') x where x->>'side' = 'B') then
      raise invalid_parameter_value using message = 'invalid_participants';
    end if;
    -- Prevent archival while validating and inserting a match.
    perform p.id from private.players p where p.deleted_at is null and p.id in (
      select (x->>'player_id')::uuid from jsonb_array_elements(p_input->'participants') x
    ) order by p.id for share;
    if (select count(*) from private.players p where p.deleted_at is null and p.id in (
      select (x->>'player_id')::uuid from jsonb_array_elements(p_input->'participants') x
    )) <> total then raise invalid_parameter_value using message = 'invalid_participants'; end if;
    insert into private.matches(played_on, created_by) values ((p_input->>'played_on')::date, actor) returning * into game;
    insert into private.match_players(match_id, player_id, side, position, name_snapshot)
      select game.id, p.id, x.value->>'side',
        (row_number() over (partition by x.value->>'side' order by x.ordinality) - 1)::integer, p.name
      from jsonb_array_elements(p_input->'participants') with ordinality x(value, ordinality)
      join private.players p on p.id = (x.value->>'player_id')::uuid;
    entity := game.id;
    result := jsonb_build_object('id', game.id, 'number', game.number, 'version', game.version);
  when 'set_match_winner', 'archive_match', 'restore_match' then
    select * into game from private.matches where id = (p_input->>'id')::uuid for update;
    if not found then raise no_data_found using message = 'not_found'; end if;
    if (p_input->>'version')::integer is distinct from game.version then
      raise sqlstate '40001' using message = 'version_conflict';
    end if;
    previous := to_jsonb(game) - 'created_by';
    if p_operation = 'set_match_winner' and (game.deleted_at is not null or not (p_input ? 'winner') or
      (p_input->'winner' <> 'null'::jsonb and (jsonb_typeof(p_input->'winner') <> 'string' or p_input->>'winner' not in ('A','B')))) then
      raise invalid_parameter_value using message = 'invalid_winner';
    end if;
    update private.matches set
      winner = case when p_operation = 'set_match_winner' then p_input->>'winner' else winner end,
      deleted_at = case when p_operation = 'archive_match' then now() when p_operation = 'restore_match' then null else deleted_at end,
      version = version + 1, updated_at = now()
      where id = game.id returning * into game;
    entity := game.id;
    result := jsonb_build_object('id', game.id, 'number', game.number, 'version', game.version, 'winner', game.winner, 'deleted_at', game.deleted_at);
  end case;
  insert into private.audit_events(actor_id, operation, entity_id, before_data, after_data)
    values (actor, p_operation, entity, previous, result);
  insert into private.mutation_receipts(actor_id, request_id, operation, input, response)
    values (actor, p_request_id, p_operation, p_input, result);
  return result;
end;
$$;

-- Needed by non-superuser migration runners when transferring function ownership.
grant volley_api_owner to current_user;
grant create on schema public to volley_api_owner;
alter function public.volley_read(text, integer, integer) owner to volley_api_owner;
alter function public.volley_mutate(text, uuid, jsonb) owner to volley_api_owner;
revoke create on schema public from volley_api_owner;
revoke volley_api_owner from current_user;
revoke all on function public.volley_read(text, integer, integer) from public, anon;
revoke all on function public.volley_mutate(text, uuid, jsonb) from public, anon;
grant execute on function public.volley_read(text, integer, integer) to authenticated;
grant execute on function public.volley_mutate(text, uuid, jsonb) to authenticated;
-- Dashboard-created event-trigger function is administrative, not an app endpoint.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
