-- =====================================================================
-- 2K Gestao v1 - FASE 2: Produtos + Estoque
-- Pre-requisitos (Fase 1): public.profiles(id, role, active),
-- public.is_active_user(), public.is_admin().
-- =====================================================================
begin;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- Categorias ----------
create table public.product_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 60),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index product_categories_name_uq on public.product_categories (lower(btrim(name)));
create trigger trg_categories_updated before update on public.product_categories
  for each row execute function public.set_updated_at();

insert into public.product_categories (name) values
  ('Capinhas'),('Películas'),('Cabos'),('Carregadores'),
  ('Fones'),('Acessórios'),('Peças'),('Outros')
on conflict do nothing;

-- ---------- Produtos ----------
create table public.products (
  id               uuid primary key default gen_random_uuid(),
  sku              text not null check (length(btrim(sku)) between 1 and 40),
  name             text not null check (length(btrim(name)) between 1 and 120),
  category_id      uuid references public.product_categories(id),
  brand            text check (length(brand) <= 60),
  compatible_model text check (length(compatible_model) <= 120),
  description      text check (length(description) <= 1000),
  cost_price       numeric(12,2) not null default 0 check (cost_price >= 0),
  sale_price       numeric(12,2) not null default 0 check (sale_price >= 0),
  current_stock    integer not null default 0 check (current_stock >= 0),
  min_stock        integer not null default 0 check (min_stock >= 0),
  active           boolean not null default true,
  created_by       uuid default auth.uid() references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index products_sku_uq on public.products (lower(btrim(sku)));
create index products_category_idx on public.products (category_id);
create index products_name_idx on public.products (lower(name));
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();

-- Protecao de current_stock: so muda dentro das RPCs (flag local da transacao)
create or replace function public.guard_current_stock()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_ok boolean := coalesce(current_setting('app.stock_rpc', true), '') = 'on';
begin
  if tg_op = 'INSERT' and new.current_stock <> 0 and not v_ok then
    raise exception 'ESTOQUE_PROTEGIDO: produto novo começa com estoque 0; use a entrada de estoque.' using errcode = '42501';
  elsif tg_op = 'UPDATE' and new.current_stock is distinct from old.current_stock and not v_ok then
    raise exception 'ESTOQUE_PROTEGIDO: o saldo só pode mudar por entrada ou ajuste de estoque.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_products_guard_stock before insert or update on public.products
  for each row execute function public.guard_current_stock();

-- ---------- Movimentos de estoque (historico imutavel) ----------
create table public.stock_movements (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products(id),
  movement_type  text not null check (movement_type in ('entrada','ajuste_positivo','ajuste_negativo')),
  quantity       integer not null check (quantity > 0),
  stock_before   integer not null check (stock_before >= 0),
  stock_after    integer not null check (stock_after >= 0),
  reason         text check (length(reason) <= 300),
  reference_type text,            -- 'sale' | 'service_order' nas fases futuras
  reference_id   uuid,
  created_by     uuid not null,
  created_at     timestamptz not null default now(),
  constraint stock_movements_created_by_fkey foreign key (created_by) references public.profiles(id),
  constraint stock_movements_math_chk check (
    stock_after = stock_before + case when movement_type = 'ajuste_negativo' then -quantity else quantity end)
);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create index stock_movements_created_idx on public.stock_movements (created_at desc);

create or replace function public.block_stock_movement_changes()
returns trigger language plpgsql as $$
begin raise exception 'HISTORICO_IMUTAVEL: movimentos de estoque não podem ser alterados ou apagados.' using errcode = '42501'; end $$;
create trigger trg_stock_movements_immutable before update or delete on public.stock_movements
  for each row execute function public.block_stock_movement_changes();

-- ---------- View para listagem / estoque baixo ----------
create view public.products_list with (security_invoker = true) as
select p.*, c.name as category_name,
       (p.active and p.current_stock <= p.min_stock) as is_low
from public.products p
left join public.product_categories c on c.id = p.category_id;

-- ---------- Funcao interna reutilizavel (vendas/OS nas proximas fases) ----------
create or replace function public.apply_stock_change(
  p_product_id uuid, p_signed_qty integer, p_type text, p_reason text,
  p_ref_type text default null, p_ref_id uuid default null)
returns public.stock_movements
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  v_prod public.products;
  v_after integer;
  v_mov  public.stock_movements;
begin
  if v_uid is null then
    raise exception 'NAO_AUTENTICADO: faça login para continuar.' using errcode = '42501';
  end if;
  if not public.is_active_user() then
    raise exception 'USUARIO_INATIVO: seu acesso está desativado.' using errcode = '42501';
  end if;
  if p_signed_qty is null or p_signed_qty = 0 or abs(p_signed_qty) > 1000000 then
    raise exception 'QUANTIDADE_INVALIDA: informe uma quantidade inteira entre 1 e 1.000.000.' using errcode = 'P0001';
  end if;

  select * into v_prod from public.products where id = p_product_id for update;  -- lock da linha
  if not found then
    raise exception 'PRODUTO_NAO_ENCONTRADO: produto não existe.' using errcode = 'P0001';
  end if;
  if not v_prod.active then
    raise exception 'PRODUTO_INATIVO: reative o produto antes de movimentar o estoque.' using errcode = 'P0001';
  end if;

  v_after := v_prod.current_stock + p_signed_qty;
  if v_after < 0 then
    raise exception 'ESTOQUE_INSUFICIENTE: saldo atual %, tentativa de remover %.', v_prod.current_stock, abs(p_signed_qty)
      using errcode = 'P0001';
  end if;

  perform set_config('app.stock_rpc', 'on', true);
  update public.products set current_stock = v_after where id = v_prod.id;
  perform set_config('app.stock_rpc', 'off', true);

  insert into public.stock_movements
    (product_id, movement_type, quantity, stock_before, stock_after, reason, reference_type, reference_id, created_by)
  values
    (v_prod.id, p_type, abs(p_signed_qty), v_prod.current_stock, v_after, nullif(btrim(p_reason), ''), p_ref_type, p_ref_id, v_uid)
  returning * into v_mov;

  return v_mov;
end $$;

-- ---------- RPCs publicas ----------
create or replace function public.add_stock(p_product_id uuid, p_quantity integer, p_reason text default null)
returns public.stock_movements
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'QUANTIDADE_INVALIDA: a entrada deve ser maior que zero.' using errcode = 'P0001';
  end if;
  return public.apply_stock_change(p_product_id, p_quantity, 'entrada', p_reason);
end $$;

create or replace function public.adjust_stock(p_product_id uuid, p_delta integer, p_reason text)
returns public.stock_movements
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'QUANTIDADE_INVALIDA: o ajuste não pode ser zero.' using errcode = 'P0001';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'MOTIVO_OBRIGATORIO: informe o motivo do ajuste.' using errcode = 'P0001';
  end if;
  return public.apply_stock_change(
    p_product_id, p_delta,
    case when p_delta > 0 then 'ajuste_positivo' else 'ajuste_negativo' end, p_reason);
end $$;

-- ---------- Permissoes ----------
revoke all on function public.apply_stock_change(uuid, integer, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.add_stock(uuid, integer, text)    from public, anon;
revoke all on function public.adjust_stock(uuid, integer, text) from public, anon;
grant execute on function public.add_stock(uuid, integer, text)    to authenticated;
grant execute on function public.adjust_stock(uuid, integer, text) to authenticated;

revoke all on public.product_categories, public.products, public.stock_movements, public.products_list from anon, authenticated;
grant select on public.product_categories, public.products, public.stock_movements, public.products_list to authenticated;
grant insert (name, active) on public.product_categories to authenticated;
grant update (name, active) on public.product_categories to authenticated;
-- current_stock NAO esta nas colunas liberadas: update/insert direto e negado
grant insert (sku, name, category_id, brand, compatible_model, description, cost_price, sale_price, min_stock, active)
  on public.products to authenticated;
grant update (sku, name, category_id, brand, compatible_model, description, cost_price, sale_price, min_stock, active)
  on public.products to authenticated;

-- ---------- RLS ----------
alter table public.product_categories enable row level security;
alter table public.products           enable row level security;
alter table public.stock_movements    enable row level security;

create policy categories_select on public.product_categories for select to authenticated using (public.is_active_user());
create policy categories_insert on public.product_categories for insert to authenticated with check (public.is_admin());
create policy categories_update on public.product_categories for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy products_select on public.products for select to authenticated using (public.is_active_user());
create policy products_insert on public.products for insert to authenticated with check (public.is_admin());
create policy products_update on public.products for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy stock_movements_select on public.stock_movements for select to authenticated using (public.is_active_user());
-- sem policy de insert/update/delete: movimentos so nascem pelas RPCs

commit;
