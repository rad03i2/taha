-- حسابات المولدة — مخطط الحسابات والمزامنة (الصقه كاملًا في Supabase ← SQL Editor ← Run)
-- آمن لإعادة التشغيل (لا يحذف بيانات).
-- لا وصول مباشر للجداول؛ كل شيء عبر دوال تتحقق من جلسة المستخدم.
-- المدير (حسن): ينشئ المشرفين ويتحكم بحساباتهم. المشرف: كل صلاحيات التطبيق عدا إدارة المشرفين.

create extension if not exists pgcrypto with schema extensions;


create table if not exists public.workspaces (
  id text primary key,
  name text,
  created_at timestamptz not null default now()
);
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  ws text not null references public.workspaces(id) on delete cascade,
  username text not null unique,
  display text not null,
  role text not null check (role in ('manager', 'supervisor')),
  pass_hash text not null,
  active boolean not null default true,
  fails int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.sessions (
  token_hash text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
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
alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.records enable row level security;
revoke all on public.workspaces, public.users, public.sessions, public.records from anon, authenticated;

-- ───── مساعدات داخلية (غير قابلة للاستدعاء من التطبيق) ─────
create or replace function public._h(k text) returns text
language sql immutable as $$ select encode(extensions.digest(k, 'sha256'), 'hex') $$;

create or replace function public._auth(p_token text) returns public.users
language sql stable security definer set search_path = public, extensions as $$
  select u.* from sessions s join users u on u.id = s.user_id
  where s.token_hash = _h(coalesce(p_token, '')) and u.active
$$;

create or replace function public._need(p_token text, p_manager boolean default false) returns public.users
language plpgsql stable security definer set search_path = public, extensions as $$
declare u users;
begin
  select * into u from _auth(p_token);
  if u.id is null then raise exception 'forbidden'; end if;
  if p_manager and u.role <> 'manager' then raise exception 'manager only'; end if;
  return u;
end $$;

create or replace function public._new_session(p_user uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  insert into sessions(token_hash, user_id) values (_h(t), p_user);
  return t;
end $$;

create or replace function public._user_json(u public.users) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', u.id, 'ws', u.ws, 'username', u.username, 'display', u.display, 'role', u.role, 'active', u.active)
$$;

revoke execute on function public._h(text), public._auth(text), public._need(text, boolean), public._new_session(uuid), public._user_json(public.users) from public, anon, authenticated;

-- ───── إنشاء المساحة والمدير (مرة واحدة) ─────
create or replace function public.setup_workspace(p_name text, p_username text, p_password text, p_display text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare w text := 'w' || encode(extensions.gen_random_bytes(6), 'hex'); u users; uname text := lower(trim(p_username));
begin
  if uname !~ '^[a-z0-9_.]{3,30}$' then raise exception 'bad username'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'weak password'; end if;
  if exists (select 1 from users where username = uname) then raise exception 'username taken'; end if;
  insert into workspaces(id, name) values (w, left(coalesce(p_name, ''), 80));
  insert into users(ws, username, display, role, pass_hash)
  values (w, uname, left(coalesce(nullif(trim(p_display), ''), uname), 60), 'manager', extensions.crypt(p_password, extensions.gen_salt('bf'))) returning * into u;
  return jsonb_build_object('token', _new_session(u.id), 'user', _user_json(u));
end $$;

-- ───── الدخول ─────
create or replace function public.login(p_username text, p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u users; uname text := lower(trim(p_username));
begin
  select * into u from users where username = uname;
  if u.id is null then return jsonb_build_object('error', 'bad credentials'); end if;
  if u.locked_until is not null and u.locked_until > now() then raise exception 'locked'; end if;
  if not u.active then raise exception 'disabled'; end if;
  if u.pass_hash <> extensions.crypt(p_password, u.pass_hash) then
    -- لا نرفع استثناءً هنا لئلا يتراجع تسجيل المحاولة الفاشلة
    update users set
      fails = case when fails + 1 >= 8 then 0 else fails + 1 end,
      locked_until = case when fails + 1 >= 8 then now() + interval '15 minutes' else locked_until end
    where id = u.id;
    return jsonb_build_object('error', 'bad credentials');
  end if;
  update users set fails = 0, locked_until = null where id = u.id;
  return jsonb_build_object('token', _new_session(u.id), 'user', _user_json(u));
end $$;

create or replace function public.me(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare u users := _need(p_token);
begin return _user_json(u); end $$;

create or replace function public.logout(p_token text)
returns void language sql security definer set search_path = public, extensions as $$
  delete from sessions where token_hash = _h(coalesce(p_token, ''))
$$;

-- ───── إدارة المشرفين (للمدير فقط) ─────
create or replace function public.users_list(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare u users := _need(p_token, true);
begin
  return coalesce((select jsonb_agg(_user_json(x) order by x.role, x.created_at) from users x where x.ws = u.ws), '[]'::jsonb);
end $$;

create or replace function public.user_create(p_token text, p_username text, p_password text, p_display text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare m users := _need(p_token, true); n users; uname text := lower(trim(p_username));
begin
  if uname !~ '^[a-z0-9_.]{3,30}$' then raise exception 'bad username'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'weak password'; end if;
  if exists (select 1 from users where username = uname) then raise exception 'username taken'; end if;
  insert into users(ws, username, display, role, pass_hash)
  values (m.ws, uname, left(coalesce(nullif(trim(p_display), ''), uname), 60), 'supervisor', extensions.crypt(p_password, extensions.gen_salt('bf'))) returning * into n;
  return _user_json(n);
end $$;

-- تعديل مشرف: الاسم، كلمة المرور (اختيارية)، التفعيل (اختياري). تغيير كلمة المرور أو التعطيل يُنهي جلساته.
create or replace function public.user_update(p_token text, p_user uuid, p_display text, p_password text, p_active boolean)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare m users := _need(p_token, true); t users;
begin
  select * into t from users where id = p_user and ws = m.ws;
  if t.id is null then raise exception 'not found'; end if;
  if t.role = 'manager' and p_active is false then raise exception 'cannot disable manager'; end if;
  if p_password is not null and length(p_password) < 6 then raise exception 'weak password'; end if;
  update users set
    display = coalesce(nullif(trim(p_display), ''), display),
    pass_hash = case when p_password is not null then extensions.crypt(p_password, extensions.gen_salt('bf')) else pass_hash end,
    active = coalesce(p_active, active)
  where id = t.id returning * into t;
  if p_password is not null or p_active is false then delete from sessions where user_id = t.id; end if;
  return _user_json(t);
end $$;

-- ───── المزامنة ─────
create or replace function public.sync_pull(p_token text, p_since timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare u users := _need(p_token); res jsonb;
begin
  with page as (
    select kind, data, updated_at from records
    where ws = u.ws and updated_at > p_since order by updated_at limit 2000
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'data', data) order by updated_at), '[]'::jsonb),
    'cursor', max(updated_at), 'n', count(*)
  ) into res from page;
  return res;
end $$;

create or replace function public.sync_push(p_token text, p_items jsonb)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare u users := _need(p_token); it jsonb; n int := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then raise exception 'bad batch'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into records(ws, kind, id, data, ts)
    values (u.ws, it->>'kind', it->>'id', it->'data', (it->>'ts')::bigint)
    on conflict (ws, kind, id) do update
      set data = excluded.data, ts = excluded.ts, updated_at = clock_timestamp()
      where records.ts < excluded.ts;
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function
  public.setup_workspace(text, text, text, text), public.login(text, text), public.me(text), public.logout(text),
  public.users_list(text), public.user_create(text, text, text, text), public.user_update(text, uuid, text, text, boolean),
  public.sync_pull(text, timestamptz), public.sync_push(text, jsonb)
to anon, authenticated;
