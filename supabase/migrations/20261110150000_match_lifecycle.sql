-- Additive lifecycle. Historical results retain unknown scores; never invent them.
alter table private.matches add column status text not null default 'in_progress';
alter table private.matches add column score_a integer check (score_a >= 0);
alter table private.matches add column score_b integer check (score_b >= 0);
alter table private.matches add column serving_side text check (serving_side in ('A','B'));
alter table private.matches add column legacy_result boolean not null default true;
update private.matches set status='finished' where winner is not null;
alter table private.matches add constraint match_lifecycle_consistent check (
  (status='in_progress' and winner is null) or
  (status='finished' and winner is not null and (
    (legacy_result and score_a is null and score_b is null) or
    (score_a is not null and score_b is not null and score_a<>score_b and
      winner=case when score_a>score_b then 'A' else 'B' end))));

-- No production phrase is supplied by a migration. An administrator configures
-- a strong shared phrase separately through a parameterized, secret-safe session.
create table private.deactivation_policy (
  id boolean primary key default true check(id), salt text not null,
  digest bytea not null, configured_at timestamptz not null default now()
);
create table private.authorization_attempts (
  scope text primary key, window_start timestamptz not null, attempts integer not null
);
alter table private.deactivation_policy enable row level security;
alter table private.authorization_attempts enable row level security;
create policy api_policy on private.deactivation_policy to volley_api_owner using(true);
create policy api_attempts on private.authorization_attempts to volley_api_owner using(true) with check(true);
revoke all on private.deactivation_policy, private.authorization_attempts from public,anon,authenticated;
grant select on private.deactivation_policy to volley_api_owner;
grant select,insert,update on private.authorization_attempts to volley_api_owner;

create function private.configure_deactivation_secret(p_secret text) returns void
language plpgsql set search_path='' as $$
declare new_salt text := gen_random_uuid()::text;
begin
  if p_secret is null or char_length(p_secret)<12 or octet_length(p_secret)>1024 then
    raise invalid_parameter_value using message='invalid_authorization_configuration';
  end if;
  insert into private.deactivation_policy(id,salt,digest) values(true,new_salt,sha256(convert_to(new_salt||p_secret,'UTF8')))
  on conflict(id) do update set salt=excluded.salt,digest=excluded.digest,configured_at=now();
end $$;
revoke all on function private.configure_deactivation_secret(text) from public,anon,authenticated,volley_api_owner;

grant volley_api_owner to current_user;
grant create on schema public,private to volley_api_owner;
set local role volley_api_owner;

create function private.canonical_player_name(p_name text) returns text
language sql immutable set search_path='' as $$select lower(btrim(regexp_replace(p_name,'[[:space:]]+',' ','g')))$$;
create function private.lifecycle_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if old.status='finished' then raise sqlstate 'PT409' using message='match_finished'; end if;
  if tg_op='DELETE' then return old; end if;
  -- The private legacy importer may create a historical result without scores.
  if new.legacy_result and new.winner is not null then new.status:='finished'; end if;
  return new;
end $$;
create function private.participant_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op<>'INSERT' or exists(select 1 from private.matches where id=new.match_id and status='finished') then
    raise sqlstate 'PT409' using message='participants_frozen';
  end if;
  return new;
end $$;
create function private.player_name_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and new.name=old.name and (new.deleted_at is null)=(old.deleted_at is null) then return new; end if;
  if new.deleted_at is null and exists(select 1 from private.players p where p.id<>new.id
    and (p.deleted_at is null or tg_op='INSERT') and private.canonical_player_name(p.name)=private.canonical_player_name(new.name)) then
    raise sqlstate 'PT409' using message='player_name_exists';
  end if;
  return new;
end $$;
-- Triggers must be created by the table owner below, not the custom API role.
reset role;
create trigger immutable_finished_match before update or delete on private.matches for each row execute function private.lifecycle_guard();
create trigger immutable_participants before insert or update or delete on private.match_players for each row execute function private.participant_guard();
create trigger canonical_player_name before insert or update on private.players for each row execute function private.player_name_guard();
set local role volley_api_owner;

create function private.lifecycle_player(p_id uuid) returns jsonb language sql set search_path='' as $$
  select jsonb_build_object('id',id,'name',name,'version',version,'deleted_at',deleted_at) from private.players where id=p_id
$$;
create function private.lifecycle_match(p_id uuid) returns jsonb language sql set search_path='' as $$
  select jsonb_build_object('id',m.id,'number',m.number,'played_on',m.played_on,'version',m.version,
    'winner',m.winner,'status',m.status,'score_a',m.score_a,'score_b',m.score_b,'serving_side',m.serving_side,
    'legacy_result',m.legacy_result,'deleted_at',m.deleted_at,'participants',
    (select jsonb_agg(jsonb_build_object('player_id',player_id,'name',name_snapshot,'side',side,'position',position)
      order by side,position) from private.match_players where match_id=m.id)) from private.matches m where m.id=p_id
$$;

create function public.volley_read_lifecycle(p_kind text,p_limit integer default 200,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
  revision text; final_revision text; result jsonb;
begin
  if actor is null then raise insufficient_privilege using message='session_required'; end if;
  if p_kind is null or p_limit is null or p_offset is null or p_limit not between 1 and 200 or p_offset not between 0 and 1000000 then raise invalid_parameter_value; end if;
  select coalesce(max(id),0)::text into revision from private.audit_events;
  if p_kind='players' then
    select coalesce(jsonb_agg(value),'[]') into result from (select private.lifecycle_player(id) value from private.players order by id limit p_limit offset p_offset) q;
  elsif p_kind in ('matches','archived_matches') then
    select coalesce(jsonb_agg(value),'[]') into result from (select private.lifecycle_match(id) value from private.matches
      where (deleted_at is null)=(p_kind='matches') order by number desc limit p_limit offset p_offset) q;
  else raise invalid_parameter_value using message='invalid_resource'; end if;
  select coalesce(max(id),0)::text into final_revision from private.audit_events;
  if revision<>final_revision then raise sqlstate 'PT409' using message='snapshot_changed'; end if;
  return jsonb_build_object('items',result,'revision',revision,'limit',p_limit,'offset',p_offset);
end $$;

create function private.lifecycle_apply(p_operation text,p_request_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
  prior private.mutation_receipts%rowtype; game private.matches%rowtype; player private.players%rowtype;
  expected text[]; entity uuid; result jsonb; before_data jsonb; audit_id bigint; item jsonb; idx integer:=0;
  a integer; b integer; canonical text;
begin
  if actor is null then raise insufficient_privilege using message='session_required'; end if;
  if p_request_id is null or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>24000 then raise invalid_parameter_value using message='invalid_command'; end if;
  expected:=case p_operation
    when 'create_player' then array['id','name'] when 'reactivate_player' then array['id','version']
    when 'deactivate_player' then array['id','version'] when 'start_match' then array['id','played_on','serving_side','participants']
    when 'save_score' then array['id','version','score_a','score_b'] when 'finish_match' then array['id','version','score_a','score_b']
    else null end;
  if expected is null or not(p_input ?& expected) or p_input-expected<>'{}'::jsonb then raise invalid_parameter_value using message='invalid_fields'; end if;
  perform pg_advisory_xact_lock(94382514);
  select * into prior from private.mutation_receipts where request_id=p_request_id;
  if found then
    if prior.operation<>p_operation or prior.input<>p_input then raise sqlstate 'PT409' using message='request_conflict'; end if;
    return prior.response;
  end if;
  perform private.consume_write_budget(actor);
  entity:=(p_input->>'id')::uuid;
  if entity is null then raise invalid_parameter_value using message='invalid_id'; end if;
  case p_operation
  when 'create_player' then
    if jsonb_typeof(p_input->'name') is distinct from 'string' then raise invalid_parameter_value; end if;
    canonical:=btrim(regexp_replace(p_input->>'name','[[:space:]]+',' ','g'));
    if char_length(canonical) not between 1 and 30 then raise invalid_parameter_value using message='invalid_name'; end if;
    insert into private.players(id,name,created_by) values(entity,canonical,actor);
    result:=private.lifecycle_player(entity);
  when 'reactivate_player','deactivate_player' then
    if jsonb_typeof(p_input->'version') is distinct from 'number' or (p_input->>'version')!~'^[1-9][0-9]*$' then raise invalid_parameter_value; end if;
    select * into player from private.players where id=entity for update;
    if not found then raise no_data_found; end if;
    if player.version<>(p_input->>'version')::integer then raise sqlstate 'PT409' using message='version_conflict'; end if;
    if (p_operation='deactivate_player' and player.deleted_at is not null) or (p_operation='reactivate_player' and player.deleted_at is null) then raise sqlstate 'PT409' using message='player_state_changed'; end if;
    before_data:=private.lifecycle_player(entity);
    update private.players set deleted_at=case when p_operation='deactivate_player' then now() else null end,version=version+1,updated_at=now() where id=entity;
    result:=private.lifecycle_player(entity);
  when 'start_match' then
    if jsonb_typeof(p_input->'played_on') is distinct from 'string' or (p_input->>'played_on')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or jsonb_typeof(p_input->'serving_side') is distinct from 'string' or p_input->>'serving_side' not in ('A','B')
      or jsonb_typeof(p_input->'participants') is distinct from 'array' or jsonb_array_length(p_input->'participants') not between 2 and 100 then raise invalid_parameter_value using message='invalid_match'; end if;
    if exists(select 1 from jsonb_array_elements(p_input->'participants') x where jsonb_typeof(x)<>'object'
      or not(x ?& array['player_id','side']) or x-array['player_id','side']<>'{}'::jsonb
      or jsonb_typeof(x->'player_id') is distinct from 'string' or jsonb_typeof(x->'side') is distinct from 'string' or x->>'side' not in ('A','B')) then raise invalid_parameter_value using message='invalid_participant'; end if;
    if (select count(distinct (x->>'player_id')::uuid) from jsonb_array_elements(p_input->'participants') x)<>jsonb_array_length(p_input->'participants')
      or not exists(select 1 from jsonb_array_elements(p_input->'participants') x where x->>'side'='A')
      or not exists(select 1 from jsonb_array_elements(p_input->'participants') x where x->>'side'='B') then raise invalid_parameter_value using message='invalid_teams'; end if;
    if exists(select 1 from jsonb_array_elements(p_input->'participants') x left join private.players p on p.id=(x->>'player_id')::uuid where p.id is null or p.deleted_at is not null) then raise sqlstate 'PT409' using message='roster_changed'; end if;
    insert into private.matches(id,played_on,serving_side,legacy_result,created_by) values(entity,(p_input->>'played_on')::date,p_input->>'serving_side',false,actor);
    for item in select value from jsonb_array_elements(p_input->'participants') loop
      insert into private.match_players(match_id,player_id,side,position,name_snapshot)
        select entity,id,item->>'side',idx,name from private.players where id=(item->>'player_id')::uuid;
      idx:=idx+1;
    end loop;
    result:=private.lifecycle_match(entity);
  when 'save_score','finish_match' then
    if jsonb_typeof(p_input->'version') is distinct from 'number' or (p_input->>'version')!~'^[1-9][0-9]*$'
      or jsonb_typeof(p_input->'score_a') is distinct from 'number' or jsonb_typeof(p_input->'score_b') is distinct from 'number'
      or (p_input->>'score_a')!~'^[0-9]+$' or (p_input->>'score_b')!~'^[0-9]+$' then raise invalid_parameter_value using message='invalid_score'; end if;
    a:=(p_input->>'score_a')::integer;b:=(p_input->>'score_b')::integer;
    select * into game from private.matches where id=entity for update;
    if not found then raise no_data_found; end if;
    if game.version<>(p_input->>'version')::integer then raise sqlstate 'PT409' using message='version_conflict'; end if;
    if game.status='finished' or game.deleted_at is not null then raise sqlstate 'PT409' using message='match_finished'; end if;
    if p_operation='finish_match' and a=b then raise invalid_parameter_value using message='tied_score'; end if;
    before_data:=private.lifecycle_match(entity);
    update private.matches set score_a=a,score_b=b,status=case when p_operation='finish_match' then 'finished' else 'in_progress' end,
      winner=case when p_operation='finish_match' then case when a>b then 'A' else 'B' end else null end,
      legacy_result=false,version=version+1,updated_at=now() where id=entity;
    result:=private.lifecycle_match(entity);
  end case;
  insert into private.audit_events(actor_id,operation,entity_id,before_data,after_data) values(actor,p_operation,entity,before_data,result) returning id into audit_id;
  result:=result||jsonb_build_object('revision',audit_id::text);
  insert into private.mutation_receipts(actor_id,request_id,operation,input,response) values(actor,p_request_id,p_operation,p_input,result);
  return result;
end $$;

create function public.volley_command(p_operation text,p_request_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_operation not in ('create_player','reactivate_player','start_match','save_score','finish_match') or p_operation is null then raise invalid_parameter_value using message='invalid_command'; end if;
  return private.lifecycle_apply(p_operation,p_request_id,p_input);
end $$;

create function public.volley_deactivate_player(p_request_id uuid,p_input jsonb,p_authorization_word text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
  policy private.deactivation_policy%rowtype; used integer; scope_key text;
begin
  if actor is null then raise insufficient_privilege using message='session_required'; end if;
  if p_authorization_word is null or octet_length(p_authorization_word)>1024 then raise invalid_parameter_value; end if;
  -- Commit failed-attempt counters by returning a safe error, not raising it.
  perform pg_advisory_xact_lock(94382514);
  select * into policy from private.deactivation_policy where id;
  if not found then return jsonb_build_object('error','authorization_not_configured'); end if;
  foreach scope_key in array array['global','actor:'||actor::text] loop
    insert into private.authorization_attempts(scope,window_start,attempts) values(scope_key,date_trunc('minute',now()),1)
    on conflict(scope) do update set window_start=date_trunc('minute',now()),attempts=case when authorization_attempts.window_start=date_trunc('minute',now()) then authorization_attempts.attempts+1 else 1 end
    returning attempts into used;
    if used>(case when scope_key='global' then 30 else 5 end) then return jsonb_build_object('error','authorization_rate_limit'); end if;
  end loop;
  if sha256(convert_to(policy.salt||p_authorization_word,'UTF8'))<>policy.digest then return jsonb_build_object('error','authorization_invalid'); end if;
  return private.lifecycle_apply('deactivate_player',p_request_id,p_input);
end $$;

create function public.volley_recover_receipt(p_request_id uuid,p_operation text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
 prior private.mutation_receipts%rowtype;
begin
 if actor is null then raise insufficient_privilege using message='session_required'; end if;
 if p_request_id is null or p_operation is null or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>32768 then raise invalid_parameter_value; end if;
 select * into prior from private.mutation_receipts where request_id=p_request_id;
 if not found then return jsonb_build_object('found',false); end if;
 if prior.operation<>p_operation or prior.input<>p_input then raise sqlstate 'PT409' using message='request_conflict'; end if;
 return jsonb_build_object('found',true);
end $$;
revoke all on function public.volley_recover_receipt(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.volley_recover_receipt(uuid,text,jsonb) to authenticated;

-- Existing clients can recover previously accepted receipts, but cannot use the
-- old unauthorised archive/result routes to bypass the new contracts.
create or replace function public.volley_mutate(p_operation text,p_request_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
  prior private.mutation_receipts%rowtype;
begin
  if actor is null then raise insufficient_privilege using message='session_required'; end if;
  perform pg_advisory_xact_lock(94382514);
  select * into prior from private.mutation_receipts where request_id=p_request_id;
  if found then
    if prior.operation<>p_operation or prior.input<>p_input then raise sqlstate 'PT409' using message='request_conflict'; end if;
    return prior.response;
  end if;
  if p_operation not in ('create_player','rename_player','create_match','restore_player') or p_operation is null then
    raise sqlstate 'PT409' using message='client_update_required';
  end if;
  perform private.consume_write_budget(actor);
  return private.volley_mutate_core(p_operation,p_request_id,p_input);
end $$;

revoke all on function private.canonical_player_name(text),private.lifecycle_guard(),private.participant_guard(),private.player_name_guard(),private.lifecycle_player(uuid),private.lifecycle_match(uuid),private.lifecycle_apply(text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.volley_read_lifecycle(text,integer,integer),public.volley_command(text,uuid,jsonb),public.volley_deactivate_player(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.volley_read_lifecycle(text,integer,integer),public.volley_command(text,uuid,jsonb),public.volley_deactivate_player(uuid,jsonb,text) to authenticated;
reset role;
revoke create on schema public,private from volley_api_owner;
revoke volley_api_owner from current_user;
