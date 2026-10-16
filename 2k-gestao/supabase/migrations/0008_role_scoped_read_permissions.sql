begin;

drop policy if exists cash_sessions_select_active on public.cash_sessions;
drop policy if exists sales_select_active on public.sales;
drop policy if exists sale_items_select_active on public.sale_items;
drop policy if exists sale_payments_select_active on public.sale_payments;
drop policy if exists cash_movements_select_active on public.cash_movements;
drop policy if exists sales_history_select_active on public.sales_history;
drop policy if exists cash_sessions_select_admin on public.cash_sessions;
drop policy if exists sales_select_admin on public.sales;
drop policy if exists sale_items_select_admin on public.sale_items;
drop policy if exists sale_payments_select_admin on public.sale_payments;
drop policy if exists cash_movements_select_admin on public.cash_movements;
drop policy if exists sales_history_select_admin on public.sales_history;

create policy cash_sessions_select_admin on public.cash_sessions for select to authenticated using (public.is_admin());
create policy sales_select_admin on public.sales for select to authenticated using (public.is_admin());
create policy sale_items_select_admin on public.sale_items for select to authenticated using (public.is_admin());
create policy sale_payments_select_admin on public.sale_payments for select to authenticated using (public.is_admin());
create policy cash_movements_select_admin on public.cash_movements for select to authenticated using (public.is_admin());
create policy sales_history_select_admin on public.sales_history for select to authenticated using (public.is_admin());

drop policy if exists service_orders_assigned_select on public.service_orders;
drop policy if exists service_order_items_assigned_select on public.service_order_items;
drop policy if exists service_order_history_assigned_select on public.service_order_history;
drop policy if exists service_orders_active_select on public.service_orders;
drop policy if exists service_order_items_active_select on public.service_order_items;
drop policy if exists service_order_history_active_select on public.service_order_history;
create policy service_orders_active_select on public.service_orders for select to authenticated
using (public.is_active_user());
create policy service_order_items_active_select on public.service_order_items for select to authenticated
using (public.is_active_user());
create policy service_order_history_active_select on public.service_order_history for select to authenticated
using (public.is_active_user());

create or replace function public.get_open_cash_summary()
returns table (session jsonb, expected numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'USUARIO_INATIVO: acesso não autorizado.' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'SEM_PERMISSAO: resumo financeiro restrito a administradores.' using errcode = '42501';
  end if;
  return query
    select to_jsonb(s),
      s.opening_balance + coalesce(sum(
        case when cm.movement_type = 'entrada' then cm.amount else -cm.amount end
      ), 0)::numeric
    from public.cash_sessions s
    left join public.cash_movements cm on cm.cash_session_id = s.id
    where s.status = 'open'
    group by s.id;
end;
$$;
revoke all on function public.get_open_cash_summary() from public, anon;
grant execute on function public.get_open_cash_summary() to authenticated;

commit;
