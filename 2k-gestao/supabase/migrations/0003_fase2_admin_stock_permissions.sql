begin;

create or replace function public.add_stock(p_product_id uuid, p_quantity integer, p_reason text default null)
returns public.stock_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'USUARIO_INATIVO: usuário não autenticado ou inativo.' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'SEM_PERMISSAO: somente administrador pode registrar entrada manual.' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'QUANTIDADE_INVALIDA: a entrada deve ser maior que zero.' using errcode = 'P0001';
  end if;
  return public.apply_stock_change(p_product_id, p_quantity, 'entrada', p_reason);
end;
$$;

create or replace function public.adjust_stock(p_product_id uuid, p_delta integer, p_reason text)
returns public.stock_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'USUARIO_INATIVO: usuário não autenticado ou inativo.' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'SEM_PERMISSAO: somente administrador pode ajustar estoque manualmente.' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'QUANTIDADE_INVALIDA: o ajuste não pode ser zero.' using errcode = 'P0001';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'MOTIVO_OBRIGATORIO: informe o motivo do ajuste.' using errcode = 'P0001';
  end if;
  return public.apply_stock_change(
    p_product_id,
    p_delta,
    case when p_delta > 0 then 'ajuste_positivo' else 'ajuste_negativo' end,
    p_reason
  );
end;
$$;

revoke all on function public.add_stock(uuid, integer, text) from public, anon;
revoke all on function public.adjust_stock(uuid, integer, text) from public, anon;
grant execute on function public.add_stock(uuid, integer, text) to authenticated;
grant execute on function public.adjust_stock(uuid, integer, text) to authenticated;

commit;
