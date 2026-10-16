begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  role text not null default 'technician' check (role in ('admin', 'technician')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_name text;
begin
  v_name := nullif(btrim(new.raw_user_meta_data ->> 'name'), '');
  if v_name is null then
    v_name := coalesce(nullif(split_part(new.email, '@', 1), ''), 'Usuário');
  end if;

  insert into public.profiles (id, name, role, active)
  values (new.id, left(v_name, 120), 'technician', true)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.role = 'admin'
  );
$$;

create or replace function public.get_my_profile()
returns table (id uuid, name text, role text, active boolean, created_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.name, p.role, p.active, p.created_at, p.updated_at
  from public.profiles p
  where p.id = auth.uid();
$$;

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
revoke all on function public.is_active_user() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.get_my_profile() to authenticated;

create policy profiles_select_self
on public.profiles for select to authenticated
using (id = auth.uid() and public.is_active_user());

create policy profiles_select_admin
on public.profiles for select to authenticated
using (public.is_admin());

commit;
