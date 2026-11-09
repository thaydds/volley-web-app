-- Managed postgres is not a superuser. Apply grants as the function owner.
grant volley_api_owner to current_user;
set local role volley_api_owner;
revoke all on function public.volley_read(text, integer, integer) from public, anon, authenticated;
revoke all on function public.volley_mutate(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.volley_read(text, integer, integer) to authenticated;
grant execute on function public.volley_mutate(text, uuid, jsonb) to authenticated;
reset role;
revoke volley_api_owner from current_user;
