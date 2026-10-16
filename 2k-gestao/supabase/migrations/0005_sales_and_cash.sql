begin;

alter table public.stock_movements
  drop constraint stock_movements_movement_type_check,
  drop constraint stock_movements_math_chk;
alter table public.stock_movements
  add constraint stock_movements_movement_type_check
    check (movement_type in ('entrada','ajuste_positivo','ajuste_negativo','venda','cancelamento_venda','uso_os','estorno_os')),
  add constraint stock_movements_math_chk check (
    stock_after = stock_before + case when movement_type in ('ajuste_negativo','venda','uso_os') then -quantity else quantity end
  );

create sequence public.sales_number_seq start 1;

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'open' check (status in ('open','closed')),
  opening_balance numeric(12,2) not null check (opening_balance >= 0),
  opened_by uuid not null references public.profiles(id),
  opened_at timestamptz not null default now(),
  opening_note text check (length(opening_note) <= 500),
  closing_expected numeric(12,2),
  closing_counted numeric(12,2),
  closing_difference numeric(12,2),
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  closing_note text check (length(closing_note) <= 500),
  constraint cash_sessions_close_fields_chk check (
    (status = 'open' and closed_at is null and closing_expected is null and closing_counted is null and closing_difference is null)
    or
    (status = 'closed' and closed_at is not null and closing_expected is not null and closing_counted is not null and closing_difference = closing_counted - closing_expected)
  )
);
create unique index cash_sessions_single_open_uq on public.cash_sessions ((status)) where status = 'open';
create index cash_sessions_opened_at_idx on public.cash_sessions (opened_at desc);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_number bigint not null unique default nextval('public.sales_number_seq'),
  cash_session_id uuid not null references public.cash_sessions(id),
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'completed' check (status in ('completed','cancelled')),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount numeric(12,2) not null check (discount >= 0 and discount <= subtotal),
  total numeric(12,2) not null check (total = subtotal - discount and total > 0),
  total_cost numeric(12,2) not null check (total_cost >= 0),
  estimated_profit numeric(12,2) not null check (estimated_profit = total - total_cost),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  cancelled_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  cancellation_reason text check (length(cancellation_reason) <= 500),
  constraint sales_cancel_fields_chk check (
    (status = 'completed' and cancelled_at is null and cancelled_by is null)
    or (status = 'cancelled' and cancelled_at is not null and cancelled_by is not null)
  )
);
create index sales_created_at_idx on public.sales (created_at desc);
create index sales_session_idx on public.sales (cash_session_id, created_at desc);
create index sales_customer_idx on public.sales (customer_id);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id),
  product_id uuid not null references public.products(id),
  product_name text not null,
  sku text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  line_total numeric(12,2) not null check (line_total = quantity * unit_price),
  created_at timestamptz not null default now()
);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (product_id);

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id),
  method text not null check (method in ('dinheiro','pix','debito','credito')),
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index sale_payments_sale_idx on public.sale_payments (sale_id);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references public.cash_sessions(id),
  movement_type text not null check (movement_type in ('entrada','saida','despesa','retirada','reversao_venda')),
  amount numeric(12,2) not null check (amount > 0),
  reason text not null check (length(btrim(reason)) between 1 and 300),
  payment_method text not null default 'dinheiro' check (payment_method = 'dinheiro'),
  sale_id uuid references public.sales(id),
  reference_type text check (reference_type is null or reference_type in ('sale','service_order')),
  reference_id uuid,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint cash_movements_reference_chk check ((reference_type is null) = (reference_id is null))
);
create index cash_movements_session_idx on public.cash_movements (cash_session_id, created_at desc);

create table public.sales_history (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id),
  event text not null check (event in ('finalized','cancelled')),
  details text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index sales_history_sale_idx on public.sales_history (sale_id, created_at);

create or replace function public.reject_financial_history_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'HISTORICO_IMUTAVEL: registros financeiros não podem ser alterados ou apagados.' using errcode = '42501';
end;
$$;

create trigger sale_items_immutable before update or delete on public.sale_items
for each row execute function public.reject_financial_history_change();
create trigger sale_payments_immutable before update or delete on public.sale_payments
for each row execute function public.reject_financial_history_change();
create trigger cash_movements_immutable before update or delete on public.cash_movements
for each row execute function public.reject_financial_history_change();
create trigger sales_history_immutable before update or delete on public.sales_history
for each row execute function public.reject_financial_history_change();

alter table public.cash_sessions enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_payments enable row level security;
alter table public.cash_movements enable row level security;
alter table public.sales_history enable row level security;
revoke all on public.cash_sessions, public.sales, public.sale_items, public.sale_payments, public.cash_movements, public.sales_history from anon, authenticated;
grant select on public.cash_sessions, public.sales, public.sale_items, public.sale_payments, public.cash_movements, public.sales_history to authenticated;
create policy cash_sessions_select_admin on public.cash_sessions for select to authenticated using (public.is_admin());
create policy sales_select_admin on public.sales for select to authenticated using (public.is_admin());
create policy sale_items_select_admin on public.sale_items for select to authenticated using (public.is_admin());
create policy sale_payments_select_admin on public.sale_payments for select to authenticated using (public.is_admin());
create policy cash_movements_select_admin on public.cash_movements for select to authenticated using (public.is_admin());
create policy sales_history_select_admin on public.sales_history for select to authenticated using (public.is_admin());

create or replace function public.apply_stock_change(
  p_product_id uuid, p_signed_qty integer, p_type text, p_reason text,
  p_ref_type text default null, p_ref_id uuid default null)
returns public.stock_movements
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_prod public.products;
  v_after integer;
  v_mov public.stock_movements;
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'USUARIO_INATIVO: usuário não autenticado ou inativo.' using errcode = '42501';
  end if;
  if p_signed_qty is null or p_signed_qty = 0 or abs(p_signed_qty) > 1000000 then
    raise exception 'QUANTIDADE_INVALIDA: informe uma quantidade válida.' using errcode = 'P0001';
  end if;
  if p_type not in ('entrada','ajuste_positivo','ajuste_negativo','venda','cancelamento_venda','uso_os','estorno_os') then
    raise exception 'MOVIMENTO_INVALIDO: tipo de movimento inválido.' using errcode = 'P0001';
  end if;
  if (p_type in ('entrada','ajuste_positivo','cancelamento_venda','estorno_os') and p_signed_qty < 0)
     or (p_type in ('ajuste_negativo','venda','uso_os') and p_signed_qty > 0) then
    raise exception 'MOVIMENTO_INVALIDO: sinal do movimento não corresponde ao tipo.' using errcode = 'P0001';
  end if;
  select * into v_prod from public.products where id = p_product_id for update;
  if not found then raise exception 'PRODUTO_NAO_ENCONTRADO: produto não existe.' using errcode = 'P0001'; end if;
  if not v_prod.active and p_type not in ('cancelamento_venda','estorno_os') then
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
revoke all on function public.apply_stock_change(uuid, integer, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.open_cash_session(p_opening_balance numeric, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_session public.cash_sessions;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'USUARIO_INATIVO: acesso não autorizado.' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'SEM_PERMISSAO: somente administrador pode abrir o caixa.' using errcode = '42501'; end if;
  if p_opening_balance is null or p_opening_balance < 0 or p_opening_balance > 9999999999.99 then
    raise exception 'VALOR_INVALIDO: saldo inicial inválido.' using errcode = 'P0001';
  end if;
  insert into public.cash_sessions (opening_balance, opened_by, opening_note)
  values (p_opening_balance, auth.uid(), left(nullif(btrim(p_note), ''), 500))
  returning * into v_session;
  return to_jsonb(v_session);
exception when unique_violation then
  raise exception 'CAIXA_JA_ABERTO: já existe um caixa aberto.' using errcode = 'P0001';
end $$;

create or replace function public.add_cash_movement(p_movement_type text, p_amount numeric, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_session public.cash_sessions; v_movement public.cash_movements;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'USUARIO_INATIVO: acesso não autorizado.' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'SEM_PERMISSAO: somente administrador pode movimentar o caixa.' using errcode = '42501'; end if;
  if p_movement_type is null or p_movement_type not in ('entrada','saida','despesa','retirada')
     or p_amount is null or p_amount <= 0 or p_amount > 9999999999.99 then
    raise exception 'VALOR_INVALIDO: tipo ou valor de movimentação inválido.' using errcode = 'P0001';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 300 then raise exception 'MOTIVO_OBRIGATORIO: informe o motivo.' using errcode = 'P0001'; end if;
  select * into v_session from public.cash_sessions where status = 'open' for update;
  if not found then raise exception 'CAIXA_FECHADO: abra o caixa antes de registrar movimentações.' using errcode = 'P0001'; end if;
  insert into public.cash_movements (cash_session_id, movement_type, amount, reason, created_by)
  values (v_session.id, p_movement_type, p_amount, btrim(p_reason), auth.uid())
  returning * into v_movement;
  return to_jsonb(v_movement);
end $$;

create or replace function public.close_cash_session(p_counted_cash numeric, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session public.cash_sessions;
  v_cash_in numeric(12,2);
  v_cash_out numeric(12,2);
  v_expected numeric(12,2);
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'USUARIO_INATIVO: acesso não autorizado.' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'SEM_PERMISSAO: somente administrador pode fechar o caixa.' using errcode = '42501'; end if;
  if p_counted_cash is null or p_counted_cash < 0 or p_counted_cash > 9999999999.99 then raise exception 'VALOR_INVALIDO: valor contado inválido.' using errcode = 'P0001'; end if;
  select * into v_session from public.cash_sessions where status = 'open' for update;
  if not found then raise exception 'CAIXA_FECHADO: não há caixa aberto.' using errcode = 'P0001'; end if;
  select coalesce(sum(amount) filter (where movement_type in ('entrada')), 0),
         coalesce(sum(amount) filter (where movement_type in ('saida','despesa','retirada','reversao_venda')), 0)
    into v_cash_in, v_cash_out
    from public.cash_movements where cash_session_id = v_session.id;
  v_expected := v_session.opening_balance + v_cash_in - v_cash_out;
  update public.cash_sessions
  set status = 'closed', closing_expected = v_expected, closing_counted = p_counted_cash,
      closing_difference = p_counted_cash - v_expected, closed_by = auth.uid(), closed_at = now(),
      closing_note = left(nullif(btrim(p_note), ''), 500)
  where id = v_session.id returning * into v_session;
  return to_jsonb(v_session);
end $$;

create or replace function public.finalize_sale(
  p_customer_id uuid, p_discount numeric, p_items jsonb, p_payments jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session public.cash_sessions;
  v_sale public.sales;
  v_product public.products;
  v_item record;
  v_payment record;
  v_subtotal numeric(12,2) := 0;
  v_total_cost numeric(12,2) := 0;
  v_total numeric(12,2);
  v_payments_total numeric(12,2) := 0;
  v_cash_total numeric(12,2) := 0;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'USUARIO_INATIVO: acesso não autorizado.' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'SEM_PERMISSAO: somente administrador pode finalizar venda.' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'ITENS_INVALIDOS: inclua uma lista de itens.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'ITENS_INVALIDOS: inclua entre 1 e 50 itens.' using errcode = 'P0001';
  end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'PAGAMENTO_INVALIDO: informe uma lista de pagamentos.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_payments) not between 1 and 4 then
    raise exception 'PAGAMENTO_INVALIDO: informe os pagamentos da venda.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where coalesce(x->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(x->>'quantity', '') !~ '^[1-9][0-9]{0,6}$'
      or case when (x->>'quantity') ~ '^[1-9][0-9]{0,6}$' then (x->>'quantity')::numeric > 1000000 else false end
  ) then raise exception 'ITENS_INVALIDOS: produto ou quantidade inválidos.' using errcode = 'P0001'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_payments) x
    where coalesce(x->>'method', '') not in ('dinheiro','pix','debito','credito')
      or coalesce(x->>'amount', '') !~ '^[0-9]+(\.[0-9]{1,2})?$'
      or case when coalesce(x->>'amount', '') ~ '^[0-9]+(\.[0-9]{1,2})?$' then (x->>'amount')::numeric <= 0 else false end
  ) then raise exception 'PAGAMENTO_INVALIDO: método ou valor inválido.' using errcode = 'P0001'; end if;
  select * into v_session from public.cash_sessions where status = 'open' for update;
  if not found then raise exception 'CAIXA_FECHADO: abra o caixa antes de vender.' using errcode = 'P0001'; end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id = p_customer_id and active) then
    raise exception 'CLIENTE_INVALIDO: cliente não encontrado ou inativo.' using errcode = 'P0001';
  end if;

  for v_item in
    select (x->>'product_id')::uuid as product_id, sum((x->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) x group by (x->>'product_id')::uuid order by (x->>'product_id')::uuid
  loop
    select * into v_product from public.products where id = v_item.product_id for update;
    if not found or not v_product.active then raise exception 'PRODUTO_INVALIDO: produto não encontrado ou inativo.' using errcode = 'P0001'; end if;
    if v_product.current_stock < v_item.quantity then
      raise exception 'ESTOQUE_INSUFICIENTE: saldo insuficiente para %.', v_product.name using errcode = 'P0001';
    end if;
    v_subtotal := v_subtotal + v_product.sale_price * v_item.quantity;
    v_total_cost := v_total_cost + v_product.cost_price * v_item.quantity;
  end loop;
  if p_discount is null or p_discount < 0 or p_discount > v_subtotal then raise exception 'DESCONTO_INVALIDO: desconto excede o subtotal.' using errcode = 'P0001'; end if;
  v_total := v_subtotal - p_discount;
  if v_total <= 0 then raise exception 'TOTAL_INVALIDO: o total da venda deve ser maior que zero.' using errcode = 'P0001'; end if;

  for v_payment in select value->>'method' as method, (value->>'amount')::numeric(12,2) as amount from jsonb_array_elements(p_payments)
  loop
    if v_payment.method not in ('dinheiro','pix','debito','credito') or v_payment.amount <= 0 then
      raise exception 'PAGAMENTO_INVALIDO: método ou valor inválido.' using errcode = 'P0001';
    end if;
    v_payments_total := v_payments_total + v_payment.amount;
    if v_payment.method = 'dinheiro' then v_cash_total := v_cash_total + v_payment.amount; end if;
  end loop;
  if v_payments_total <> v_total then raise exception 'PAGAMENTO_INVALIDO: os pagamentos devem corresponder ao total da venda.' using errcode = 'P0001'; end if;

  insert into public.sales (cash_session_id, customer_id, subtotal, discount, total, total_cost, estimated_profit, created_by)
  values (v_session.id, p_customer_id, v_subtotal, p_discount, v_total, v_total_cost, v_total - v_total_cost, auth.uid())
  returning * into v_sale;

  for v_item in
    select (x->>'product_id')::uuid as product_id, sum((x->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) x group by (x->>'product_id')::uuid order by (x->>'product_id')::uuid
  loop
    select * into v_product from public.products where id = v_item.product_id;
    insert into public.sale_items (sale_id, product_id, product_name, sku, quantity, unit_price, unit_cost, line_total)
    values (v_sale.id, v_product.id, v_product.name, v_product.sku, v_item.quantity, v_product.sale_price, v_product.cost_price, v_product.sale_price * v_item.quantity);
    perform public.apply_stock_change(v_product.id, -v_item.quantity, 'venda', 'Venda #' || lpad(v_sale.sale_number::text, 6, '0'), 'sale', v_sale.id);
  end loop;
  for v_payment in select value->>'method' as method, (value->>'amount')::numeric(12,2) as amount from jsonb_array_elements(p_payments)
  loop
    insert into public.sale_payments (sale_id, method, amount) values (v_sale.id, v_payment.method, v_payment.amount);
  end loop;
  if v_cash_total > 0 then
    insert into public.cash_movements (cash_session_id, movement_type, amount, reason, sale_id, reference_type, reference_id, created_by)
    values (v_session.id, 'entrada', v_cash_total, 'Recebimento da venda #' || lpad(v_sale.sale_number::text, 6, '0'), v_sale.id, 'sale', v_sale.id, auth.uid());
  end if;
  insert into public.sales_history (sale_id, event, details, created_by)
  values (v_sale.id, 'finalized', 'Venda finalizada.', auth.uid());
  return jsonb_build_object('sale', to_jsonb(v_sale), 'number', lpad(v_sale.sale_number::text, 6, '0'));
end $$;

create or replace function public.cancel_sale(p_sale_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_sale public.sales;
  v_session public.cash_sessions;
  v_item record;
  v_cash_total numeric(12,2);
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'USUARIO_INATIVO: acesso não autorizado.' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'SEM_PERMISSAO: somente administrador pode cancelar venda.' using errcode = '42501'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then raise exception 'MOTIVO_OBRIGATORIO: informe o motivo do cancelamento.' using errcode = 'P0001'; end if;
  select * into v_session from public.cash_sessions where status = 'open' for update;
  if not found then raise exception 'CAIXA_FECHADO: abra o caixa para cancelar a venda.' using errcode = 'P0001'; end if;
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'VENDA_NAO_ENCONTRADA: venda não encontrada.' using errcode = 'P0001'; end if;
  if v_sale.status <> 'completed' then raise exception 'VENDA_JA_CANCELADA: venda já cancelada.' using errcode = 'P0001'; end if;
  for v_item in select product_id, quantity from public.sale_items where sale_id = v_sale.id order by product_id
  loop
    perform public.apply_stock_change(v_item.product_id, v_item.quantity, 'cancelamento_venda',
      'Cancelamento da venda #' || lpad(v_sale.sale_number::text, 6, '0'), 'sale', v_sale.id);
  end loop;
  select coalesce(sum(amount), 0) into v_cash_total from public.sale_payments where sale_id = v_sale.id and method = 'dinheiro';
  if v_cash_total > 0 then
    insert into public.cash_movements (cash_session_id, movement_type, amount, reason, sale_id, reference_type, reference_id, created_by)
    values (v_session.id, 'reversao_venda', v_cash_total, 'Estorno da venda #' || lpad(v_sale.sale_number::text, 6, '0'), v_sale.id, 'sale', v_sale.id, auth.uid());
  end if;
  update public.sales set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(),
    cancellation_reason = btrim(p_reason) where id = v_sale.id returning * into v_sale;
  insert into public.sales_history (sale_id, event, details, created_by)
  values (v_sale.id, 'cancelled', btrim(p_reason), auth.uid());
  return to_jsonb(v_sale);
end $$;

revoke all on function public.open_cash_session(numeric, text), public.close_cash_session(numeric, text),
  public.add_cash_movement(text, numeric, text), public.finalize_sale(uuid, numeric, jsonb, jsonb),
  public.cancel_sale(uuid, text) from public, anon;
grant execute on function public.open_cash_session(numeric, text), public.close_cash_session(numeric, text),
  public.add_cash_movement(text, numeric, text), public.finalize_sale(uuid, numeric, jsonb, jsonb),
  public.cancel_sale(uuid, text) to authenticated;

commit;
