-- Testes transacionais das fases 3-5. Usa um admin ativo existente e termina em ROLLBACK.
-- Rode em ambiente descartável com:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fase3_5_clientes_vendas_caixa_os.sql
begin;

create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
end $$;

do $$
declare
  v_admin uuid;
  v_customer uuid;
  v_product uuid;
  v_sale jsonb;
  v_sale_id uuid;
  v_order jsonb;
  v_order_id uuid;
  v_order2 jsonb;
  v_order2_id uuid;
  v_order3 jsonb;
  v_order3_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_stock integer;
  v_total numeric;
  v_count integer;
  v_expected numeric;
  v_diff numeric;
  v_failed boolean;
  v_cpf text := lpad((floor(random() * 99999999999)::bigint)::text, 11, '0');
  v_sales_before integer;
begin
  select id into v_admin from public.profiles where role = 'admin' and active limit 1;
  if v_admin is null then raise exception 'FALHOU PREPARAÇÃO: nenhum administrador ativo.'; end if;
  perform set_config('test.admin', v_admin::text, true);

  insert into public.customers (name, phone, cpf, email)
  values ('Cliente Teste F3', '(11) 99999-0000', v_cpf, 'teste@example.invalid')
  returning id into v_customer;
  if (select phone_normalized from public.customers where id = v_customer) <> '11999990000'
     or (select cpf_normalized from public.customers where id = v_customer) <> v_cpf then
    raise exception 'FALHOU F3: normalização de telefone/CPF.';
  end if;
  v_failed := false;
  begin
    insert into public.customers (name, phone, cpf) values ('Duplicado F3', '11999990001', v_cpf);
  exception when unique_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'FALHOU F3: CPF duplicado foi aceito.'; end if;
  raise notice 'OK F3 normalização e unicidade parcial de CPF';

  insert into public.products (sku, name, cost_price, sale_price)
  values ('TEST-F35-' || left(gen_random_uuid()::text, 8), 'Produto Teste F4/F5', 10, 25)
  returning id into v_product;
  perform set_config('test.customer', v_customer::text, true);
  perform set_config('test.product', v_product::text, true);

  perform pg_temp.as_user(v_admin);
  v_failed := false;
  begin
    perform public.finalize_sale(null, 0, jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1)),
      jsonb_build_array(jsonb_build_object('method', 'dinheiro', 'amount', 25)));
  exception when others then v_failed := true;
  end;
  execute 'reset role';
  if not v_failed then raise exception 'FALHOU F4: venda sem caixa aberto foi aceita.'; end if;
  raise notice 'OK F4 venda sem caixa falha';

  select count(*) into v_sales_before from public.sales;
  perform pg_temp.as_user(v_admin);
  perform public.add_stock(v_product, 2, 'preparo teste F4/F5');
  perform public.open_cash_session(10, 'teste F4/F5');
  v_failed := false;
  begin
    perform public.open_cash_session(0, 'segundo caixa');
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'FALHOU F4: permitiu segundo caixa aberto.'; end if;

  v_failed := false;
  begin
    perform public.finalize_sale(null, 0, jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 3)),
      jsonb_build_array(jsonb_build_object('method', 'dinheiro', 'amount', 75)));
  exception when others then v_failed := true;
  end;
  execute 'reset role';
  select current_stock into v_stock from public.products where id = v_product;
  select count(*) into v_count from public.sales;
  if not v_failed or v_stock <> 2 or v_count <> v_sales_before then raise exception 'FALHOU F4: estoque insuficiente teve efeito parcial.'; end if;

  perform pg_temp.as_user(v_admin);
  v_sale := public.finalize_sale(v_customer, 5, jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1)),
    jsonb_build_array(jsonb_build_object('method', 'dinheiro', 'amount', 20)));
  v_sale_id := (v_sale->'sale'->>'id')::uuid;
  execute 'reset role';
  select current_stock into v_stock from public.products where id = v_product;
  select total, sale_number into v_total, v_count from public.sales where id = v_sale_id;
  if v_stock <> 1 or v_total <> 20 or v_count < 1 then raise exception 'FALHOU F4: venda válida inconsistente.'; end if;
  raise notice 'OK F4 venda, itens, lucro estimado, caixa e baixa atômica';

  perform pg_temp.as_user(v_admin);
  perform public.cancel_sale(v_sale_id, 'teste cancelamento');
  v_failed := false;
  begin perform public.cancel_sale(v_sale_id, 'duplicado'); exception when others then v_failed := true; end;
  execute 'reset role';
  select current_stock into v_stock from public.products where id = v_product;
  if not v_failed or v_stock <> 2 or (select status from public.sales where id = v_sale_id) <> 'cancelled' then
    raise exception 'FALHOU F4: cancelamento/estorno de venda inconsistente.';
  end if;
  raise notice 'OK F4 cancelamento único, estoque restaurado, histórico preservado';

  perform pg_temp.as_user(v_admin);
  v_failed := false;
  begin
    perform public.create_service_order(null, 'Celular', 'Modelo teste', 'Defeito teste', null, 50, null);
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'FALHOU F5: OS sem cliente foi aceita.'; end if;
  v_order := public.create_service_order(v_customer, 'Celular', 'Modelo teste', 'Não liga', null, 50, null);
  v_order_id := (v_order->'order'->>'id')::uuid;
  v_failed := false;
  begin perform public.change_service_order_status(v_order_id, 'pronto', 'salto inválido'); exception when others then v_failed := true; end;
  if not v_failed then raise exception 'FALHOU F5: transição de status arbitrária aceita.'; end if;
  perform public.change_service_order_status(v_order_id, 'em_analise', null);
  perform public.change_service_order_status(v_order_id, 'aguardando_aprovacao', null);
  perform public.change_service_order_status(v_order_id, 'em_manutencao', null);
  v_item := public.add_service_order_item(v_order_id, v_product, 1);
  v_item_id := (v_item->>'id')::uuid;
  execute 'reset role';
  select current_stock into v_stock from public.products where id = v_product;
  if v_stock <> 1 then raise exception 'FALHOU F5: peça não baixou estoque.'; end if;
  perform pg_temp.as_user(v_admin);
  perform public.remove_service_order_item(v_order_id, v_item_id);
  execute 'reset role';
  select current_stock into v_stock from public.products where id = v_product;
  if v_stock <> 2 then raise exception 'FALHOU F5: remoção da peça não estornou estoque.'; end if;
  perform pg_temp.as_user(v_admin);
  v_item := public.add_service_order_item(v_order_id, v_product, 1);
  perform public.change_service_order_status(v_order_id, 'cancelado', 'teste cancelamento OS');
  v_failed := false;
  begin perform public.change_service_order_status(v_order_id, 'recebido', null); exception when others then v_failed := true; end;
  execute 'reset role';
  select current_stock into v_stock from public.products where id = v_product;
  select count(*) into v_count from public.service_order_history where service_order_id = v_order_id;
  if not v_failed or v_stock <> 2 or v_count < 7 then raise exception 'FALHOU F5: cancelamento/histórico de OS inconsistente.'; end if;
  raise notice 'OK F5 cliente obrigatório, estados, peças e histórico imutável';

  perform pg_temp.as_user(v_admin);
  v_order2 := public.create_service_order(v_customer, 'Aparelho atribuído', 'Modelo teste', 'Tela', v_admin, 0, null);
  v_order2_id := (v_order2->'order'->>'id')::uuid;
  v_order3 := public.create_service_order(v_customer, 'Aparelho não atribuído', 'Modelo teste', 'Bateria', null, 0, null);
  v_order3_id := (v_order3->'order'->>'id')::uuid;
  execute 'reset role';
  update public.profiles set role = 'technician' where id = v_admin;
  perform pg_temp.as_user(v_admin);
  select count(*) into v_count from public.sales;
  if v_count <> 0 then raise exception 'FALHOU RBAC: technician leu vendas.'; end if;
  select count(*) into v_count from public.cash_sessions;
  if v_count <> 0 then raise exception 'FALHOU RBAC: technician leu caixa.'; end if;
  select count(*) into v_count from public.service_orders where id in (v_order2_id, v_order3_id);
  if v_count <> 2 then raise exception 'FALHOU RBAC: technician não conseguiu consultar OS.'; end if;
  v_failed := false;
  begin perform public.change_service_order_status(v_order3_id, 'em_analise', null); exception when others then v_failed := true; end;
  if not v_failed then raise exception 'FALHOU RBAC: technician alterou OS não atribuída.'; end if;
  perform public.change_service_order_status(v_order2_id, 'em_analise', null);
  v_failed := false;
  begin perform public.change_service_order_status(v_order2_id, 'cancelado', 'cancelamento não autorizado'); exception when others then v_failed := true; end;
  execute 'reset role';
  update public.profiles set role = 'admin' where id = v_admin;
  if not v_failed then raise exception 'FALHOU RBAC: technician cancelou OS.'; end if;
  raise notice 'OK RBAC technician sem dados financeiros; consulta OS e opera apenas a atribuída';

  perform pg_temp.as_user(v_admin);
  perform public.add_cash_movement('entrada', 3, 'teste entrada manual');
  v_order := public.close_cash_session(12, 'contagem de teste');
  execute 'reset role';
  v_expected := (v_order->>'closing_expected')::numeric;
  v_diff := (v_order->>'closing_difference')::numeric;
  if v_expected <> 13 or v_diff <> -1 then raise exception 'FALHOU F4: esperado % diferença %', v_expected, v_diff; end if;
  raise notice 'OK F4 fechamento calcula esperado/diferença';
end $$;

rollback;
select 'FASES 3-5: testes transacionais passaram (rollback aplicado)' as resultado;
