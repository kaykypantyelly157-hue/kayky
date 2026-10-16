begin;

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
    select to_jsonb(s), s.opening_balance + coalesce((
      select sum(case when cm.movement_type = 'entrada' then cm.amount else -cm.amount end)
      from public.cash_movements cm where cm.cash_session_id = s.id
    ), 0)::numeric
    from public.cash_sessions s
    where s.status = 'open';
end;
$$;

revoke all on function public.get_open_cash_summary() from public, anon;
grant execute on function public.get_open_cash_summary() to authenticated;

commit;
