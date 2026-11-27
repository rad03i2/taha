-- حسابات المولدة — مخطط المزامنة (الصقه كاملًا في Supabase ← SQL Editor ← Run)
-- التصميم: لا وصول مباشر للجداول؛ كل شيء عبر دوال تتحقق من مفتاح المساحة المشتركة.
-- مفتاح المدير = كل الصلاحيات، مفتاح الجابي = تسجيل الدفعات والملاحظات فقط.

create table if not exists public.workspaces (
  id text primary key,
  admin_hash text not null,
  collector_hash text not null,
  name text,
  created_at timestamptz not null default now()
);

create table if not exists public.records (
  ws text not null references public.workspaces(id) on delete cascade,
  kind text not null,
  id text not null,
  data jsonb not null,
  ts bigint not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (ws, kind, id)
);
create index if not exists records_ws_updated on public.records (ws, updated_at);

alter table public.workspaces enable row level security;
alter table public.records enable row level security;
revoke all on public.workspaces, public.records from anon, authenticated;

create or replace function public._h(k text) returns text
language sql immutable as $$ select encode(sha256(convert_to(k, 'utf8')), 'hex') $$;

create or replace function public._role(p_ws text, p_key text) returns text
language sql stable security definer set search_path = public as $$
  select case when admin_hash = _h(p_key) then 'admin'
              when collector_hash = _h(p_key) then 'collector' end
  from workspaces where id = p_ws
$$;
revoke execute on function public._h(text) from public, anon, authenticated;
revoke execute on function public._role(text, text) from public, anon, authenticated;

create or replace function public.create_workspace(p_id text, p_admin text, p_collector text, p_name text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if p_id !~ '^[a-z0-9]{6,40}$' then raise exception 'bad id'; end if;
  if length(p_admin) < 16 or length(p_collector) < 16 or p_admin = p_collector then raise exception 'weak key'; end if;
  insert into workspaces(id, admin_hash, collector_hash, name) values (p_id, _h(p_admin), _h(p_collector), left(p_name, 80));
  return 'ok';
end $$;

create or replace function public.sync_whoami(p_ws text, p_key text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(_role(p_ws, p_key), 'none')
$$;

create or replace function public.sync_pull(p_ws text, p_key text, p_since timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r text := _role(p_ws, p_key); res jsonb;
begin
  if r is null then raise exception 'forbidden'; end if;
  with page as (
    select kind, data, updated_at from records
    where ws = p_ws and updated_at > p_since
    order by updated_at limit 2000
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'data', data) order by updated_at), '[]'::jsonb),
    'cursor', max(updated_at),
    'n', count(*)
  ) into res from page;
  return res;
end $$;

create or replace function public.sync_push(p_ws text, p_key text, p_items jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r text := _role(p_ws, p_key); it jsonb; n int := 0;
begin
  if r is null then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then raise exception 'bad batch'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if r = 'collector' and (it->>'kind') not in ('records', 'log', 'notes') then continue; end if;
    insert into records(ws, kind, id, data, ts)
    values (p_ws, it->>'kind', it->>'id', it->'data', (it->>'ts')::bigint)
    on conflict (ws, kind, id) do update
      set data = excluded.data, ts = excluded.ts, updated_at = clock_timestamp()
      where records.ts < excluded.ts;
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function public.create_workspace(text, text, text, text) to anon, authenticated;
grant execute on function public.sync_whoami(text, text) to anon, authenticated;
grant execute on function public.sync_pull(text, text, timestamptz) to anon, authenticated;
grant execute on function public.sync_push(text, text, jsonb) to anon, authenticated;
