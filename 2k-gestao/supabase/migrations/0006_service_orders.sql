begin;

create sequence public.service_order_number_seq start 1;

create table public.service_orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint not null unique default nextval('public.service_order_number_seq'),
  customer_id uuid not null references public.customers(id),
  device text not null check (length(btrim(device)) between 1 and 120),
  brand_model text check (brand_model is null or length(brand_model) <= 160),
  reported_issue text not null check (length(btrim(reported_issue)) between 1 and 2000),
  diagnosis text check (diagnosis is null or length(diagnosis) <= 4000),
  service_description text check (service_description is null or length(service_description) <= 4000),
  observations text check (observations is null or length(observations) <= 4000),
  technician_id uuid references public.profiles(id),
  labor_amount numeric(12,2) not null default 0 check (labor_amount >= 0),
  parts_total numeric(12,2) not null default 0 check (parts_total >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0 and discount <= labor_amount + parts_total),
  total numeric(12,2) not null default 0 check (total = labor_amount + parts_total - discount),
  status text not null default 'recebido' check (status in (
    'recebido','em_analise','aguardando_aprovacao','aguardando_peca','em_manutencao','pronto','entregue','cancelado'
  )),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  constraint service_orders_final_status_chk check (
    (status <> 'entregue' or delivered_at is not null)
    and (status <> 'cancelado' or cancelled_at is not null)
  )
);
create index service_orders_status_idx on public.service_orders (status, updated_at desc);
create index service_orders_customer_idx on public.service_orders (customer_id, created_at desc);
create index service_orders_technician_idx on public.service_orders (technician_id, status, updated_at desc);
create trigger service_orders_set_updated_at before update on public.service_orders
for each row execute function public.set_updated_at();

create table public.service_order_items (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references public.service_orders(id),
  product_id uuid not null references public.products(id),
  product_name text not null,
  sku text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  line_total numeric(12,2) not null check (line_total = quantity * unit_price),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  reversed_by uuid references public.profiles(id),
  reversed_at timestamptz,
  constraint service_order_items_reversal_chk check ((reversed_at is null) = (reversed_by is null))
);
create index service_order_items_order_idx on public.service_order_items (service_order_id, created_at);
create index service_order_items_product_idx on public.service_order_items (product_id);

create table public.service_order_history (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references public.service_orders(id),
  previous_status text check (previous_status is null or previous_status in (
    'recebido','em_analise','aguardando_aprovacao','aguardando_peca','em_manutencao','pronto','entregue','cancelado'
  )),
  new_status text not null check (new_status in (
    'recebido','em_analise','aguardando_aprovacao','aguardando_peca','em_manutencao','pronto','entregue','cancelado'
  )),
  event text not null check (event in ('created','status_changed','part_added','part_removed','cancelled')),
  details text check (details is null or length(details) <= 1000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index service_order_history_order_idx on public.service_order_history (service_order_id, created_at);
create trigger service_order_history_immutable before update or delete on public.service_order_history
for each row execute function public.reject_financial_history_change();
create trigger service_order_items_no_delete before delete on public.service_order_items
for each row execute function public.reject_financial_history_change();

alter table public.service_orders enable row level security;
alter table public.service_order_items enable row level security;
alter table public.service_order_history enable row level security;
revoke all on public.service_orders, public.service_order_items, public.service_order_history from anon, authenticated;
grant select on public.service_orders, public.service_order_items, public.service_order_history to authenticated;
create policy service_orders_assigned_select on public.service_orders for select to authenticated
using (public.is_active_user() and (public.is_admin() or technician_id = auth.uid()));
create policy service_order_items_assigned_select on public.service_order_items for select to authenticated
using (public.is_active_user() and exists (
  select 1 from public.service_orders so where so.id = service_order_items.service_order_id
  and (public.is_admin() or so.technician_id = auth.uid())
));
create policy service_order_history_assigned_select on public.service_order_history for select to authenticated
using (public.is_active_user() and exists (
  select 1 from public.service_orders so where so.id = service_order_history.service_order_id
  and (public.is_admin() or so.technician_id = auth.uid())
));

create or replace function public.create_service_order(
  p_customer_id uuid, p_device text, p_brand_model text, p_reported_issue text,
  p_technician_id uuid default null, p_labor_amount numeric default 0, p_observations text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order public.service_orders;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'USUARIO_INATIVO: acesso não autorizado.' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'SEM_PERMISSAO: somente administrador pode abrir uma OS.' using errcode = '42501'; end if;
  if not exists (select 1 from public.customers where id = p_customer_id and active) then
    raise exception 'CLIENTE_INVALIDO: selecione um cliente ativo.' using errcode = 'P0001';
  end if;
  if p_device is null or length(btrim(p_device)) not between 1 and 120 then raise exception 'APARELHO_INVALIDO: informe o aparelho.' using errcode = 'P0001'; end if;
  if p_reported_issue is null or length(btrim(p_reported_issue)) not between 1 and 2000 then raise exception 'DEFEITO_INVALIDO: informe o defeito relatado.' using errcode = 'P0001'; end if;
  if p_labor_amount is null or p_labor_amount < 0 then raise exception 'VALOR_INVALIDO: mão de obra inválida.' using errcode = 'P0001'; end if;
  if p_technician_id is not null and not exists (
    select 1 from public.profiles where id = p_technician_id and active and role = 'technician'
  ) then raise exception 'TECNICO_INVALIDO: técnico não encontrado ou inativo.' using errcode = 'P0001'; end if;
  insert into public.service_orders (
    customer_id, device, brand_model, reported_issue, technician_id, labor_amount,
    total, observations, created_by
  ) values (
    p_customer_id, btrim(p_device), nullif(btrim(p_brand_model), ''), btrim(p_reported_issue),
    p_technician_id, p_labor_amount, p_labor_amount, nullif(btrim(p_observations), ''), auth.uid()
  ) returning * into v_order;
  insert into public.service_order_history (service_order_id, previous_status, new_status, event, details, created_by)
  values (v_order.id, null, 'recebido', 'created', 'Ordem de serviço criada.', auth.uid());
  return jsonb_build_object('order', to_jsonb(v_order), 'number', lpad(v_order.order_number::text, 6, '0'));
end $$;

create or replace function public.update_service_order(
  p_service_order_id uuid, p_diagnosis text, p_service_description text, p_observations text,
  p_technician_id uuid, p_labor_amount numeric, p_discount numeric)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order public.service_orders;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'USUARIO_INATIVO: acesso não autorizado.' using errcode = '42501'; end if;
  select * into v_order from public.service_orders where id = p_service_order_id for update;
  if not found then raise exception 'OS_NAO_ENCONTRADA: ordem de serviço não encontrada.' using errcode = 'P0001'; end if;
  if not public.is_admin() and v_order.technician_id is distinct from auth.uid() then
    raise exception 'SEM_PERMISSAO: ordem de serviço não atribuída ao usuário.' using errcode = '42501';
  end if;
  if v_order.status in ('entregue','cancelado') then raise exception 'OS_FINALIZADA: OS entregue ou cancelada não pode ser alterada.' using errcode = 'P0001'; end if;
  if not public.is_admin() and p_technician_id is distinct from v_order.technician_id then
    raise exception 'SEM_PERMISSAO: somente administrador pode atribuir técnico.' using errcode = '42501';
  end if;
  if not public.is_admin() and (p_labor_amount is distinct from v_order.labor_amount or p_discount is distinct from v_order.discount) then
    raise exception 'SEM_PERMISSAO: somente administrador pode alterar valores da OS.' using errcode = '42501';
  end if;
  if p_labor_amount is null or p_labor_amount < 0 or p_discount is null or p_discount < 0
     or p_discount > p_labor_amount + v_order.parts_total then
    raise exception 'VALOR_INVALIDO: mão de obra ou desconto inválido.' using errcode = 'P0001';
  end if;
  if p_technician_id is not null and not exists (
    select 1 from public.profiles where id = p_technician_id and active and role = 'technician'
  ) then raise exception 'TECNICO_INVALIDO: técnico não encontrado ou inativo.' using errcode = 'P0001'; end if;
  update public.service_orders set diagnosis = nullif(btrim(p_diagnosis), ''),
    service_description = nullif(btrim(p_service_description), ''),
    observations = nullif(btrim(p_observations), ''), technician_id = p_technician_id,
    labor_amount = p_labor_amount, discount = p_discount,
    total = p_labor_amount + parts_total - p_discount
  where id = v_order.id returning * into v_order;
  return to_jsonb(v_order);
end $$;

create or replace function public.change_service_order_status(p_service_order_id uuid, p_new_status text, p_details text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.service_orders;
  v_item record;
  v_previous_status text;
  v_allowed boolean := false;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'USUARIO_INATIVO: acesso não autorizado.' using errcode = '42501'; end if;
  select * into v_order from public.service_orders where id = p_service_order_id for update;
  if not found then raise exception 'OS_NAO_ENCONTRADA: ordem de serviço não encontrada.' using errcode = 'P0001'; end if;
  if not public.is_admin() and v_order.technician_id is distinct from auth.uid() then
    raise exception 'SEM_PERMISSAO: ordem de serviço não atribuída ao usuário.' using errcode = '42501';
  end if;
  if p_new_status = 'cancelado' and not public.is_admin() then raise exception 'SEM_PERMISSAO: somente administrador pode cancelar OS.' using errcode = '42501'; end if;
  v_allowed := case v_order.status
    when 'recebido' then p_new_status in ('em_analise','cancelado')
    when 'em_analise' then p_new_status in ('aguardando_aprovacao','aguardando_peca','em_manutencao','cancelado')
    when 'aguardando_aprovacao' then p_new_status in ('aguardando_peca','em_manutencao','cancelado')
    when 'aguardando_peca' then p_new_status in ('em_manutencao','cancelado')
    when 'em_manutencao' then p_new_status in ('aguardando_peca','pronto','cancelado')
    when 'pronto' then p_new_status in ('em_manutencao','entregue','cancelado')
    else false
  end;
  if not v_allowed then raise exception 'TRANSICAO_INVALIDA: mudança de status não permitida.' using errcode = 'P0001'; end if;
  if p_details is not null and length(p_details) > 1000 then raise exception 'OBSERVACAO_INVALIDA: observação muito longa.' using errcode = 'P0001'; end if;
  v_previous_status := v_order.status;
  if p_new_status = 'cancelado' then
    for v_item in select id, product_id, quantity from public.service_order_items
      where service_order_id = v_order.id and reversed_at is null order by product_id
    loop
      perform public.apply_stock_change(v_item.product_id, v_item.quantity, 'estorno_os',
        'Cancelamento da OS #' || lpad(v_order.order_number::text, 6, '0'), 'service_order', v_order.id);
      update public.service_order_items set reversed_at = now(), reversed_by = auth.uid() where id = v_item.id;
    end loop;
  end if;
  update public.service_orders set status = p_new_status,
    ready_at = case when p_new_status = 'pronto' then now() else ready_at end,
    delivered_at = case when p_new_status = 'entregue' then now() else delivered_at end,
    cancelled_at = case when p_new_status = 'cancelado' then now() else cancelled_at end
  where id = v_order.id returning * into v_order;
  insert into public.service_order_history (service_order_id, previous_status, new_status, event, details, created_by)
  values (v_order.id, v_previous_status, p_new_status,
    case when p_new_status = 'cancelado' then 'cancelled' else 'status_changed' end, nullif(btrim(p_details), ''), auth.uid());
  return to_jsonb(v_order);
end $$;

create or replace function public.add_service_order_item(p_service_order_id uuid, p_product_id uuid, p_quantity integer)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order public.service_orders; v_product public.products; v_item public.service_order_items;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'USUARIO_INATIVO: acesso não autorizado.' using errcode = '42501'; end if;
  select * into v_order from public.service_orders where id = p_service_order_id for update;
  if not found then raise exception 'OS_NAO_ENCONTRADA: ordem de serviço não encontrada.' using errcode = 'P0001'; end if;
  if not public.is_admin() and v_order.technician_id is distinct from auth.uid() then raise exception 'SEM_PERMISSAO: OS não atribuída.' using errcode = '42501'; end if;
  if v_order.status in ('entregue','cancelado') then raise exception 'OS_FINALIZADA: não é possível alterar peças.' using errcode = 'P0001'; end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 then raise exception 'QUANTIDADE_INVALIDA: quantidade inválida.' using errcode = 'P0001'; end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found or not v_product.active then raise exception 'PRODUTO_INVALIDO: produto não encontrado ou inativo.' using errcode = 'P0001'; end if;
  perform public.apply_stock_change(v_product.id, -p_quantity, 'uso_os',
    'Uso na OS #' || lpad(v_order.order_number::text, 6, '0'), 'service_order', v_order.id);
  insert into public.service_order_items (
    service_order_id, product_id, product_name, sku, quantity, unit_price, unit_cost, line_total, created_by
  ) values (
    v_order.id, v_product.id, v_product.name, v_product.sku, p_quantity, v_product.sale_price,
    v_product.cost_price, v_product.sale_price * p_quantity, auth.uid()
  ) returning * into v_item;
  update public.service_orders set parts_total = parts_total + v_item.line_total,
    total = labor_amount + parts_total + v_item.line_total - discount where id = v_order.id;
  insert into public.service_order_history (service_order_id, previous_status, new_status, event, details, created_by)
  values (v_order.id, v_order.status, v_order.status, 'part_added', v_product.name || ' × ' || p_quantity, auth.uid());
  return to_jsonb(v_item);
end $$;

create or replace function public.remove_service_order_item(p_service_order_id uuid, p_item_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order public.service_orders; v_item public.service_order_items;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'USUARIO_INATIVO: acesso não autorizado.' using errcode = '42501'; end if;
  select * into v_order from public.service_orders where id = p_service_order_id for update;
  if not found then raise exception 'OS_NAO_ENCONTRADA: ordem de serviço não encontrada.' using errcode = 'P0001'; end if;
  if not public.is_admin() and v_order.technician_id is distinct from auth.uid() then raise exception 'SEM_PERMISSAO: OS não atribuída.' using errcode = '42501'; end if;
  if v_order.status in ('entregue','cancelado') then raise exception 'OS_FINALIZADA: não é possível alterar peças.' using errcode = 'P0001'; end if;
  select * into v_item from public.service_order_items where id = p_item_id and service_order_id = v_order.id and reversed_at is null for update;
  if not found then raise exception 'PECA_NAO_ENCONTRADA: peça ativa não encontrada na OS.' using errcode = 'P0001'; end if;
  perform public.apply_stock_change(v_item.product_id, v_item.quantity, 'estorno_os',
    'Remoção da peça da OS #' || lpad(v_order.order_number::text, 6, '0'), 'service_order', v_order.id);
  update public.service_order_items set reversed_at = now(), reversed_by = auth.uid() where id = v_item.id;
  update public.service_orders set parts_total = parts_total - v_item.line_total,
    total = labor_amount + parts_total - v_item.line_total - discount where id = v_order.id;
  insert into public.service_order_history (service_order_id, previous_status, new_status, event, details, created_by)
  values (v_order.id, v_order.status, v_order.status, 'part_removed', v_item.product_name || ' × ' || v_item.quantity, auth.uid());
  return to_jsonb(v_item);
end $$;

revoke all on function public.create_service_order(uuid,text,text,text,uuid,numeric,text),
  public.update_service_order(uuid,text,text,text,uuid,numeric,numeric),
  public.change_service_order_status(uuid,text,text),
  public.add_service_order_item(uuid,uuid,integer),
  public.remove_service_order_item(uuid,uuid) from public, anon;
grant execute on function public.create_service_order(uuid,text,text,text,uuid,numeric,text),
  public.update_service_order(uuid,text,text,text,uuid,numeric,numeric),
  public.change_service_order_status(uuid,text,text),
  public.add_service_order_item(uuid,uuid,integer),
  public.remove_service_order_item(uuid,uuid) to authenticated;

commit;
