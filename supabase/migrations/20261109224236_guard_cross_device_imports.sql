create index matches_played_on on private.matches(played_on);
grant volley_api_owner to current_user;
grant create on schema public to volley_api_owner;
set local role volley_api_owner;
create or replace function public.volley_import(p_request_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid;
  source uuid;
  receipt private.mutation_receipts%rowtype;
  prior private.import_records%rowtype;
  game jsonb;
  participant jsonb;
  names text[];
  legacy_name text;
  player uuid;
  match_id uuid;
  participants jsonb;
  result jsonb;
  added_players integer:=0;
  added_matches integer:=0;
  skipped integer:=0;
begin
  if actor is null then raise insufficient_privilege using message='session_required'; end if;
  if p_request_id is null or p_input is null or jsonb_typeof(p_input)<>'object'
    or not(p_input ?& array['source_id','players','matches']) or p_input-array['source_id','players','matches']<>'{}'::jsonb
    or octet_length(p_input::text)>32768 or jsonb_typeof(p_input->'players') is distinct from 'array'
    or jsonb_typeof(p_input->'matches') is distinct from 'array' then
    raise invalid_parameter_value using message='invalid_import';
  end if;
  source:=(p_input->>'source_id')::uuid;
  if source is null or jsonb_array_length(p_input->'players')>1000 or jsonb_array_length(p_input->'matches')>500 then
    raise invalid_parameter_value using message='invalid_import';
  end if;
  perform pg_advisory_xact_lock(94382514);
  select * into receipt from private.mutation_receipts where request_id=p_request_id;
  if found then
    if receipt.operation<>'import_history' or receipt.input<>p_input then raise sqlstate '40001' using message='request_conflict'; end if;
    return receipt.response;
  end if;
  perform private.consume_write_budget(actor);
  if exists(select 1 from jsonb_array_elements(p_input->'players') x where jsonb_typeof(x)<>'string') then
    raise invalid_parameter_value using message='invalid_name';
  end if;
  if (select count(*) from jsonb_array_elements(p_input->'matches')) <>
     (select count(distinct x->>'key') from jsonb_array_elements(p_input->'matches') x) then
    raise invalid_parameter_value using message='duplicate_import_key';
  end if;
  select array_agg(value) into names from jsonb_array_elements_text(p_input->'players');
  for game in select value from jsonb_array_elements(p_input->'matches') loop
    if jsonb_typeof(game)<>'object' or not(game ?& array['key','played_on','winner','team_a','team_b'])
      or game-array['key','played_on','winner','team_a','team_b','allow_duplicate']<>'{}'::jsonb
      or jsonb_typeof(game->'key') is distinct from 'string' or char_length(game->>'key') not between 1 and 100
      or (game ? 'allow_duplicate' and jsonb_typeof(game->'allow_duplicate')<>'boolean')
      or jsonb_typeof(game->'team_a') is distinct from 'array' or jsonb_typeof(game->'team_b') is distinct from 'array'
      or (game->'winner'<>'null'::jsonb and (jsonb_typeof(game->'winner')<>'string' or game->>'winner' not in ('A','B'))) then
      raise invalid_parameter_value using message='invalid_import_match';
    end if;
    if jsonb_array_length(game->'team_a')<1 or jsonb_array_length(game->'team_b')<1
      or jsonb_array_length(game->'team_a')+jsonb_array_length(game->'team_b')>100
      or exists(select 1 from jsonb_array_elements((game->'team_a')||(game->'team_b')) x where jsonb_typeof(x)<>'string') then
      raise invalid_parameter_value using message='invalid_import_match';
    end if;
    select names||array_agg(value) into names from jsonb_array_elements_text((game->'team_a')||(game->'team_b'));
  end loop;
  for legacy_name in select distinct btrim(x) from unnest(names) x loop
    if legacy_name is null or char_length(legacy_name) not between 1 and 30 then raise invalid_parameter_value using message='invalid_name'; end if;
    select id into player from private.players where deleted_at is null and lower(private.players.name)=lower(legacy_name);
    if not found then
      perform private.volley_mutate_core('create_player',gen_random_uuid(),jsonb_build_object('name',legacy_name));
      added_players:=added_players+1;
    end if;
  end loop;
  for game in select value from jsonb_array_elements(p_input->'matches') loop
    select * into prior from private.import_records where source_id=source and record_key=game->>'key';
    if found then
      if prior.payload-'allow_duplicate'<>game-'allow_duplicate' then raise sqlstate '40001' using message='import_record_conflict'; end if;
      skipped:=skipped+1;
      continue;
    end if;
    -- A concurrent import from another device must not silently create a duplicate.
    -- Explicit override is only supplied after the preview flags a possible repeat.
    if not coalesce((game->>'allow_duplicate')::boolean,false) and exists(
      select 1 from private.matches m where m.played_on=(game->>'played_on')::date
        and not exists(select 1 from private.import_records imported where imported.source_id=source and imported.match_id=m.id) and (
        (
          (select array_agg(lower(btrim(mp.name_snapshot)) order by lower(btrim(mp.name_snapshot))) from private.match_players mp where mp.match_id=m.id and mp.side='A') =
          (select array_agg(lower(btrim(value)) order by lower(btrim(value))) from jsonb_array_elements_text(game->'team_a'))
          and
          (select array_agg(lower(btrim(mp.name_snapshot)) order by lower(btrim(mp.name_snapshot))) from private.match_players mp where mp.match_id=m.id and mp.side='B') =
          (select array_agg(lower(btrim(value)) order by lower(btrim(value))) from jsonb_array_elements_text(game->'team_b'))
        ) or (
          (select array_agg(lower(btrim(mp.name_snapshot)) order by lower(btrim(mp.name_snapshot))) from private.match_players mp where mp.match_id=m.id and mp.side='B') =
          (select array_agg(lower(btrim(value)) order by lower(btrim(value))) from jsonb_array_elements_text(game->'team_a'))
          and
          (select array_agg(lower(btrim(mp.name_snapshot)) order by lower(btrim(mp.name_snapshot))) from private.match_players mp where mp.match_id=m.id and mp.side='A') =
          (select array_agg(lower(btrim(value)) order by lower(btrim(value))) from jsonb_array_elements_text(game->'team_b'))
        )
      )
    ) then raise sqlstate '40001' using message='possible_duplicate'; end if;
    participants:='[]'::jsonb;
    for participant in
      select jsonb_build_object('name',value,'side','A') from jsonb_array_elements_text(game->'team_a')
      union all select jsonb_build_object('name',value,'side','B') from jsonb_array_elements_text(game->'team_b')
    loop
      select id into player from private.players where deleted_at is null and lower(private.players.name)=lower(btrim(participant->>'name'));
      participants:=participants||jsonb_build_array(jsonb_build_object('player_id',player,'side',participant->>'side'));
    end loop;
    result:=private.volley_mutate_core('create_match',gen_random_uuid(),jsonb_build_object('played_on',game->>'played_on','participants',participants));
    match_id:=(result->>'id')::uuid;
    if game->'winner'<>'null'::jsonb then
      perform private.volley_mutate_core('set_match_winner',gen_random_uuid(),jsonb_build_object('id',match_id,'version',1,'winner',game->>'winner'));
    end if;
    insert into private.import_records(source_id,record_key,payload,match_id) values(source,game->>'key',game,match_id);
    added_matches:=added_matches+1;
  end loop;
  result:=jsonb_build_object('players_added',added_players,'matches_added',added_matches,'matches_skipped',skipped);
  insert into private.audit_events(actor_id,operation,entity_id,after_data) values(actor,'import_history',p_request_id,result);
  insert into private.mutation_receipts(actor_id,request_id,operation,input,response) values(actor,p_request_id,'import_history',p_input,result);
  return result;
end $$;
reset role;
revoke create on schema public from volley_api_owner;
revoke volley_api_owner from current_user;
