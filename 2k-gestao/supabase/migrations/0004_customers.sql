begin;

create or replace function public.normalize_digits(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
$$;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  phone text not null check (length(btrim(phone)) between 1 and 40),
  phone_normalized text generated always as (public.normalize_digits(phone)) stored,
  cpf text,
  cpf_normalized text generated always as (
    case when nullif(public.normalize_digits(cpf), '') is null then null else public.normalize_digits(cpf) end
  ) stored,
  email text check (email is null or length(email) <= 254),
  notes text check (notes is null or length(notes) <= 2000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_cpf_digits_chk check (cpf is null or public.normalize_digits(cpf) = '' or length(public.normalize_digits(cpf)) = 11)
);

create index customers_name_search_idx on public.customers (lower(name));
create index customers_phone_search_idx on public.customers (phone_normalized);
create unique index customers_cpf_normalized_uq on public.customers (cpf_normalized) where cpf_normalized is not null;
create trigger customers_set_updated_at before update on public.customers
for each row execute function public.set_updated_at();

alter table public.customers enable row level security;
revoke all on public.customers from anon, authenticated;
grant select on public.customers to authenticated;
grant insert (name, phone, cpf, email, notes, active) on public.customers to authenticated;
grant update (name, phone, cpf, email, notes, active) on public.customers to authenticated;

create policy customers_select_active
on public.customers for select to authenticated
using (public.is_active_user());

create policy customers_insert_admin
on public.customers for insert to authenticated
with check (public.is_admin());

create policy customers_update_admin
on public.customers for update to authenticated
using (public.is_admin())
with check (public.is_admin());

commit;
