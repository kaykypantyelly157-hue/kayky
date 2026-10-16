-- =====================================================================
-- Testes SQL da FASE 2. Tudo roda em transacao e termina em ROLLBACK.
-- Falha = erro "FALHOU: ..." e o script para. Sucesso = mensagem final.
-- Rode com: psql "$DATABASE_URL" -f supabase/tests/fase2_estoque.sql
-- (no SQL Editor do Supabase tambem funciona)
-- Premissa: existe ao menos 1 admin ativo em public.profiles.
-- =====================================================================
begin;

create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
end $$;

-- Preparacao (como postgres)
do $$
declare v_admin uuid; v_pid uuid;
begin
  select id into v_admin from public.profiles where role = 'admin' and active limit 1;
  if v_admin is null then raise exception 'FALHOU: preparacao - nenhum admin ativo em profiles'; end if;
  insert into public.products (sku, name, category_id, cost_price, sale_price, min_stock)
  values ('TST-001', 'Produto de teste', (select id from public.product_categories where name = 'Capinhas'), 5, 15, 3)
  returning id into v_pid;
  perform set_config('test.admin', v_admin::text, true);
  perform set_config('test.pid', v_pid::text, true);
end $$;

-- T1: 0 + entrada 10 = 10, movimento 0 -> 10
do $$
declare m public.stock_movements; s int;
begin
  perform pg_temp.as_user(current_setting('test.admin')::uuid);
  m := public.add_stock(current_setting('test.pid')::uuid, 10, 'teste entrada');
  execute 'reset role';
  select current_stock into s from public.products where id = m.product_id;
  if s <> 10 or m.stock_before <> 0 or m.stock_after <> 10 or m.movement_type <> 'entrada' then
    raise exception 'FALHOU T1: saldo %, movimento %->%', s, m.stock_before, m.stock_after; end if;
  raise notice 'OK T1 entrada em estoque zero';
end $$;

-- T2: 10 + ajuste -3 = 7
do $$
declare m public.stock_movements; s int;
begin
  perform pg_temp.as_user(current_setting('test.admin')::uuid);
  m := public.adjust_stock(current_setting('test.pid')::uuid, -3, 'quebra');
  execute 'reset role';
  select current_stock into s from public.products where id = m.product_id;
  if s <> 7 or m.movement_type <> 'ajuste_negativo' or m.quantity <> 3 then raise exception 'FALHOU T2: saldo %', s; end if;
  raise notice 'OK T2 ajuste negativo valido';
end $$;

-- T3: remover mais do que existe falha sem alterar saldo nem historico
do $$
declare ok boolean := false; s int; n int;
begin
  perform pg_temp.as_user(current_setting('test.admin')::uuid);
  begin perform public.adjust_stock(current_setting('test.pid')::uuid, -100, 'erro');
  exception when others then ok := true; raise notice '  erro esperado: %', sqlerrm; end;
  execute 'reset role';
  select current_stock into s from public.products where id = current_setting('test.pid')::uuid;
  select count(*) into n from public.stock_movements where product_id = current_setting('test.pid')::uuid;
  if not ok or s <> 7 or n <> 2 then raise exception 'FALHOU T3: ok=%, saldo=%, movimentos=%', ok, s, n; end if;
  raise notice 'OK T3 estoque insuficiente nao altera nada';
end $$;

-- T4: ajuste positivo +5 = 12; motivo obrigatorio; quantidade zero invalida
do $$
declare m public.stock_movements; ok1 boolean := false; ok2 boolean := false; ok3 boolean := false;
begin
  perform pg_temp.as_user(current_setting('test.admin')::uuid);
  m := public.adjust_stock(current_setting('test.pid')::uuid, 5, 'contagem');
  begin perform public.adjust_stock(current_setting('test.pid')::uuid, 2, '  '); exception when others then ok1 := true; end;
  begin perform public.adjust_stock(current_setting('test.pid')::uuid, 0, 'x');  exception when others then ok2 := true; end;
  begin perform public.add_stock(current_setting('test.pid')::uuid, -1, 'x');    exception when others then ok3 := true; end;
  execute 'reset role';
  if m.stock_after <> 12 or not (ok1 and ok2 and ok3) then raise exception 'FALHOU T4'; end if;
  raise notice 'OK T4 ajuste positivo e validacoes';
end $$;

-- T5: update/insert direto em current_stock e negado
do $$
declare ok1 boolean := false; ok2 boolean := false; s int;
begin
  perform pg_temp.as_user(current_setting('test.admin')::uuid);
  begin update public.products set current_stock = 999 where id = current_setting('test.pid')::uuid; exception when others then ok1 := true; end;
  begin insert into public.products (sku, name, current_stock) values ('TST-002', 'x', 50); exception when others then ok2 := true; end;
  execute 'reset role';
  select current_stock into s from public.products where id = current_setting('test.pid')::uuid;
  if not (ok1 and ok2) or s <> 12 then raise exception 'FALHOU T5: ok1=%, ok2=%, saldo=%', ok1, ok2, s; end if;
  raise notice 'OK T5 current_stock protegido';
end $$;

-- T6: movimentos nao podem ser inseridos/alterados/apagados; produto nao pode ser apagado
do $$
declare ok1 boolean := false; ok2 boolean := false; ok3 boolean := false; ok4 boolean := false;
begin
  perform pg_temp.as_user(current_setting('test.admin')::uuid);
  begin insert into public.stock_movements (product_id, movement_type, quantity, stock_before, stock_after, created_by)
        values (current_setting('test.pid')::uuid, 'entrada', 1, 12, 13, current_setting('test.admin')::uuid);
  exception when others then ok1 := true; end;
  begin delete from public.products where id = current_setting('test.pid')::uuid; exception when others then ok2 := true; end;
  execute 'reset role';
  begin update public.stock_movements set reason = 'adulterado'; exception when others then ok3 := true; end;
  begin delete from public.stock_movements;                        exception when others then ok4 := true; end;
  if not (ok1 and ok2 and ok3 and ok4) then raise exception 'FALHOU T6: % % % %', ok1, ok2, ok3, ok4; end if;
  raise notice 'OK T6 historico imutavel e sem delete de produto';
end $$;

-- T7: produto inativo bloqueado
do $$
declare ok boolean := false;
begin
  update public.products set active = false where id = current_setting('test.pid')::uuid;
  perform pg_temp.as_user(current_setting('test.admin')::uuid);
  begin perform public.add_stock(current_setting('test.pid')::uuid, 1, 'x'); exception when others then ok := true; end;
  execute 'reset role';
  update public.products set active = true where id = current_setting('test.pid')::uuid;
  if not ok then raise exception 'FALHOU T7'; end if;
  raise notice 'OK T7 produto inativo bloqueado';
end $$;

-- T8: usuario inativo bloqueado
do $$
declare ok boolean := false;
begin
  update public.profiles set active = false where id = current_setting('test.admin')::uuid;
  perform pg_temp.as_user(current_setting('test.admin')::uuid);
  begin perform public.add_stock(current_setting('test.pid')::uuid, 1, 'x'); exception when others then ok := true; end;
  execute 'reset role';
  update public.profiles set active = true where id = current_setting('test.admin')::uuid;
  if not ok then raise exception 'FALHOU T8'; end if;
  raise notice 'OK T8 usuario inativo bloqueado';
end $$;

-- T9: anonimo e autenticado sem sub bloqueados
do $$
declare ok1 boolean := false; ok2 boolean := false; ok3 boolean := false;
begin
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  begin perform public.add_stock(current_setting('test.pid')::uuid, 1, 'x'); exception when others then ok1 := true; end;
  begin perform count(*) from public.products;                               exception when others then ok2 := true; end;
  execute 'reset role';
  execute 'set local role authenticated';
  begin perform public.add_stock(current_setting('test.pid')::uuid, 1, 'x'); exception when others then ok3 := true; end;
  execute 'reset role';
  if not (ok1 and ok2 and ok3) then raise exception 'FALHOU T9: % % %', ok1, ok2, ok3; end if;
  raise notice 'OK T9 anonimo sem acesso';
end $$;

-- T10: technician consulta estoque, mas nao pode movimentar ou cadastrar produto
do $$
declare can_read boolean := false; movement_blocked boolean := false; insert_blocked boolean := false; s int;
begin
  update public.profiles set role = 'technician' where id = current_setting('test.admin')::uuid;
  perform pg_temp.as_user(current_setting('test.admin')::uuid);
  select exists(select 1 from public.products where id = current_setting('test.pid')::uuid) into can_read;
  begin
    perform public.add_stock(current_setting('test.pid')::uuid, 1, 'tecnico');
  exception when others then movement_blocked := true;
  end;
  begin
    insert into public.products (sku, name) values ('TST-003', 'x');
  exception when others then insert_blocked := true;
  end;
  execute 'reset role';
  select current_stock into s from public.products where id = current_setting('test.pid')::uuid;
  update public.profiles set role = 'admin' where id = current_setting('test.admin')::uuid;
  if not can_read or not movement_blocked or not insert_blocked or s <> 12 then
    raise exception 'FALHOU T10: leitura %, movimento bloqueado %, insert bloqueado %, saldo %',
      can_read, movement_blocked, insert_blocked, s;
  end if;
  raise notice 'OK T10 permissao de technician';
end $$;

rollback;
select 'FASE 2: todos os testes SQL passaram (rollback aplicado)' as resultado;
