#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_dir"

supabase() {
  npx --yes supabase@2.121.0 "$@"
}

eval "$(supabase status --output env)"
: "${API_URL:?Supabase API URL is missing}"
: "${ANON_KEY:?Supabase anon key is missing}"
: "${SERVICE_ROLE_KEY:?Supabase service role key is missing}"
: "${DB_URL:?Supabase database URL is missing}"

supabase db reset --local --no-seed --yes

applied_migrations="$(psql "$DB_URL" -X -A -t -v ON_ERROR_STOP=1 -c \
  "select version from supabase_migrations.schema_migrations order by version")"
expected_migrations=$'0001\n0002\n0003\n0004\n0005\n0006\n0007\n0008'
if [[ "$applied_migrations" != "$expected_migrations" ]]; then
  printf 'Expected migrations:\n%s\nApplied migrations:\n%s\n' "$expected_migrations" "$applied_migrations" >&2
  exit 1
fi
echo "PASS: migrations 0001-0008 applied in order"

test_email="admin@2k-gestao.test"
test_password="$(openssl rand -hex 24)"
user_response="$(curl --fail-with-body --silent --show-error \
  --request POST "$API_URL/auth/v1/admin/users" \
  --header "apikey: $SERVICE_ROLE_KEY" \
  --header "Authorization: Bearer $SERVICE_ROLE_KEY" \
  --header "Content-Type: application/json" \
  --data "$(jq -n --arg email "$test_email" --arg password "$test_password" \
    '{email: $email, password: $password, email_confirm: true}')")"
admin_id="$(jq -r '.id // empty' <<<"$user_response")"
if [[ -z "$admin_id" ]]; then
  echo "Auth admin API did not return a user id" >&2
  exit 1
fi

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -v admin_id="$admin_id" <<'SQL'
update public.profiles set role = 'admin', active = true where id = :'admin_id'::uuid;
select set_config('test.admin_id', :'admin_id', false);
do $$
begin
  if not exists (
    select 1 from public.profiles
    where id = current_setting('test.admin_id')::uuid and role = 'admin' and active
  ) then
    raise exception 'Failed to promote the test profile to admin';
  end if;
end;
$$;
SQL

invalid_login_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --request POST "$API_URL/auth/v1/token?grant_type=password" \
  --header "apikey: $ANON_KEY" \
  --header "Content-Type: application/json" \
  --data "$(jq -n --arg email "$test_email" --arg password 'wrong-password' \
    '{email: $email, password: $password}')")"
if [[ "$invalid_login_status" != "400" ]]; then
  echo "Invalid-password login returned HTTP $invalid_login_status, expected 400" >&2
  exit 1
fi

login_response="$(curl --fail-with-body --silent --show-error \
  --request POST "$API_URL/auth/v1/token?grant_type=password" \
  --header "apikey: $ANON_KEY" \
  --header "Content-Type: application/json" \
  --data "$(jq -n --arg email "$test_email" --arg password "$test_password" \
    '{email: $email, password: $password}')")"
access_token="$(jq -r '.access_token // empty' <<<"$login_response")"
refresh_token="$(jq -r '.refresh_token // empty' <<<"$login_response")"
if [[ -z "$access_token" || -z "$refresh_token" ]]; then
  echo "Valid login did not issue a session" >&2
  exit 1
fi

authenticated_user="$(curl --fail-with-body --silent --show-error \
  "$API_URL/auth/v1/user" \
  --header "apikey: $ANON_KEY" \
  --header "Authorization: Bearer $access_token")"
if [[ "$(jq -r '.id' <<<"$authenticated_user")" != "$admin_id" ]]; then
  echo "Authenticated session resolved to the wrong user" >&2
  exit 1
fi
echo "PASS: Auth rejects invalid credentials and establishes a valid session"

technician_email="technician@2k-gestao.test"
technician_password="$(openssl rand -hex 24)"
technician_response="$(curl --fail-with-body --silent --show-error \
  --request POST "$API_URL/auth/v1/admin/users" \
  --header "apikey: $SERVICE_ROLE_KEY" \
  --header "Authorization: Bearer $SERVICE_ROLE_KEY" \
  --header "Content-Type: application/json" \
  --data "$(jq -n --arg email "$technician_email" --arg password "$technician_password" \
    '{email: $email, password: $password, email_confirm: true}')")"
technician_id="$(jq -r '.id // empty' <<<"$technician_response")"
if [[ -z "$technician_id" ]]; then
  echo "Auth admin API did not return a technician user id" >&2
  exit 1
fi
technician_login="$(curl --fail-with-body --silent --show-error \
  --request POST "$API_URL/auth/v1/token?grant_type=password" \
  --header "apikey: $ANON_KEY" \
  --header "Content-Type: application/json" \
  --data "$(jq -n --arg email "$technician_email" --arg password "$technician_password" \
    '{email: $email, password: $password}')")"
technician_token="$(jq -r '.access_token // empty' <<<"$technician_login")"
if [[ -z "$technician_token" || "$(jq -r '.user.id // empty' <<<"$technician_login")" != "$technician_id" ]]; then
  echo "Technician login did not establish the expected session" >&2
  exit 1
fi
technician_profile="$(curl --fail-with-body --silent --show-error \
  "$API_URL/rest/v1/profiles?select=id,role,active&id=eq.$technician_id" \
  --header "apikey: $ANON_KEY" \
  --header "Authorization: Bearer $technician_token")"
if ! jq -e --arg id "$technician_id" \
  'length == 1 and .[0].id == $id and .[0].role == "technician" and .[0].active == true' \
  <<<"$technician_profile" >/dev/null; then
  echo "New technician profile is missing, inactive, or has the wrong role" >&2
  exit 1
fi
echo "PASS: technician account login and self-profile RLS"

missing_profile_id="00000000-0000-0000-0000-000000000001"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -v missing_profile_id="$missing_profile_id" <<'SQL'
begin;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'missing_profile_id', 'role', 'authenticated')::text,
  true
);
select set_config('request.jwt.claim.sub', :'missing_profile_id', true);
set local role authenticated;
do $$
declare
  profile_count integer;
begin
  select count(*) into profile_count from public.get_my_profile();
  if profile_count <> 0 or public.is_active_user() then
    raise exception 'A missing profile was returned or treated as active';
  end if;
end;
$$;
rollback;
SQL
echo "PASS: missing profile receives neither profile data nor active-user access"

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -v admin_id="$admin_id" <<'SQL'
update public.profiles set active = false where id = :'admin_id'::uuid;
SQL
inactive_response="$(curl --fail-with-body --silent --show-error \
  --request POST "$API_URL/rest/v1/rpc/is_active_user" \
  --header "apikey: $ANON_KEY" \
  --header "Authorization: Bearer $access_token" \
  --header "Content-Type: application/json" \
  --data '{}')"
if [[ "$inactive_response" != "false" ]]; then
  echo "Inactive profile RPC returned '$inactive_response', expected false" >&2
  exit 1
fi
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -v admin_id="$admin_id" <<'SQL'
update public.profiles set active = true where id = :'admin_id'::uuid;
SQL
echo "PASS: authenticated but inactive user is denied active-user access"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -v admin_id="$admin_id" \
  -f supabase/tests/fase2_estoque.sql
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -v admin_id="$admin_id" \
  -f supabase/tests/fase3_5_clientes_vendas_caixa_os.sql

product_sku="CI-CONC-$(openssl rand -hex 6)"
product_id="$(psql "$DB_URL" -X -q -A -t -v ON_ERROR_STOP=1 -v product_sku="$product_sku" <<'SQL'
insert into public.products (sku, name, cost_price, sale_price)
values (:'product_sku', 'Concurrent stock test', 1, 2)
returning id;
SQL
)"

run_add_stock() {
  local log_file="$1"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 \
    -v admin_id="$admin_id" -v product_id="$product_id" <<'SQL' >"$log_file" 2>&1
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin_id', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', :'admin_id', true);
select public.add_stock(:'product_id'::uuid, 10, 'concurrent CI stock add');
commit;
SQL
}

run_add_stock "$tmp_dir/add-a.log" &
add_a_pid=$!
run_add_stock "$tmp_dir/add-b.log" &
add_b_pid=$!
set +e
wait "$add_a_pid"
add_a_status=$?
wait "$add_b_pid"
add_b_status=$?
set -e
if [[ "$add_a_status" -ne 0 || "$add_b_status" -ne 0 ]]; then
  cat "$tmp_dir/add-a.log" "$tmp_dir/add-b.log" >&2
  echo "Concurrent stock additions did not both succeed" >&2
  exit 1
fi

run_adjust_stock() {
  local log_file="$1"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 \
    -v admin_id="$admin_id" -v product_id="$product_id" <<'SQL' >"$log_file" 2>&1
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin_id', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', :'admin_id', true);
select public.adjust_stock(:'product_id'::uuid, -15, 'concurrent CI stock adjustment');
commit;
SQL
}

run_adjust_stock "$tmp_dir/adjust-a.log" &
adjust_a_pid=$!
run_adjust_stock "$tmp_dir/adjust-b.log" &
adjust_b_pid=$!
set +e
wait "$adjust_a_pid"
adjust_a_status=$?
wait "$adjust_b_pid"
adjust_b_status=$?
set -e
if [[ "$adjust_a_status" -eq "$adjust_b_status" ]]; then
  cat "$tmp_dir/adjust-a.log" "$tmp_dir/adjust-b.log" >&2
  echo "Expected exactly one of two concurrent 15-unit adjustments to succeed" >&2
  exit 1
fi

concurrency_result="$(psql "$DB_URL" -X -A -t -F '|' -v ON_ERROR_STOP=1 \
  -v product_id="$product_id" <<'SQL'
select p.current_stock,
  count(m.id),
  count(*) filter (where m.stock_before = 0 and m.stock_after = 10),
  count(*) filter (where m.stock_before = 10 and m.stock_after = 20),
  count(*) filter (where m.stock_before = 20 and m.stock_after = 5),
  coalesce(min(m.stock_after), 0)
from public.products p
left join public.stock_movements m on m.product_id = p.id
where p.id = :'product_id'::uuid
group by p.id, p.current_stock;
SQL
)"
if [[ "$concurrency_result" != "5|3|1|1|1|5" ]]; then
  echo "Unexpected concurrent stock state: $concurrency_result" >&2
  exit 1
fi
echo "PASS: concurrent adds serialize, one competing removal is rejected, and stock history remains consistent"

technician_stock_status="$(curl --silent --show-error --output "$tmp_dir/technician-stock.json" --write-out '%{http_code}' \
  --request POST "$API_URL/rest/v1/rpc/add_stock" \
  --header "apikey: $ANON_KEY" \
  --header "Authorization: Bearer $technician_token" \
  --header "Content-Type: application/json" \
  --data "$(jq -n --arg id "$product_id" \
    '{p_product_id: $id, p_quantity: 1, p_reason: "unauthorized technician CI test"}')")"
if [[ "$technician_stock_status" == "200" ]]; then
  echo "Technician unexpectedly changed stock through the REST API" >&2
  exit 1
fi
technician_stock_after="$(psql "$DB_URL" -X -A -t -v ON_ERROR_STOP=1 \
  -v product_id="$product_id" <<'SQL'
select current_stock from public.products where id = :'product_id'::uuid;
SQL
)"
if [[ "$technician_stock_after" != "5" ]]; then
  echo "Unauthorized technician request changed stock to $technician_stock_after" >&2
  exit 1
fi
echo "PASS: technician REST request cannot mutate stock"

cash_race_sku="CI-CASH-RACE-$(openssl rand -hex 6)"
cash_race_product_id="$(psql "$DB_URL" -X -q -A -t -v ON_ERROR_STOP=1 -v product_sku="$cash_race_sku" <<'SQL'
insert into public.products (sku, name, cost_price, sale_price)
values (:'product_sku', 'Concurrent cash-close test', 1, 2)
returning id;
SQL
)"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 \
  -v admin_id="$admin_id" -v product_id="$cash_race_product_id" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin_id', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', :'admin_id', true);
select public.add_stock(:'product_id'::uuid, 1, 'cash-close concurrency setup');
select public.open_cash_session(20, 'cash-close concurrency test');
commit;
SQL

run_close_cash() {
  local log_file="$1"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -v admin_id="$admin_id" <<'SQL' >"$log_file" 2>&1
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin_id', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', :'admin_id', true);
select pg_sleep(0.1);
select public.close_cash_session(20, 'concurrent close');
commit;
SQL
}

run_racing_sale() {
  local log_file="$1"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 \
    -v admin_id="$admin_id" -v product_id="$cash_race_product_id" <<'SQL' >"$log_file" 2>&1
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin_id', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', :'admin_id', true);
select pg_sleep(0.1);
select public.finalize_sale(
  null,
  0,
  jsonb_build_array(jsonb_build_object('product_id', :'product_id'::uuid, 'quantity', 1)),
  jsonb_build_array(jsonb_build_object('method', 'dinheiro', 'amount', 2))
);
commit;
SQL
}

run_close_cash "$tmp_dir/close.log" &
close_pid=$!
run_racing_sale "$tmp_dir/sale.log" &
sale_pid=$!
set +e
wait "$close_pid"
close_status=$?
wait "$sale_pid"
sale_status=$?
set -e
if [[ "$close_status" -ne 0 ]]; then
  cat "$tmp_dir/close.log" "$tmp_dir/sale.log" >&2
  echo "Cash close failed while racing a sale" >&2
  exit 1
fi
if [[ "$sale_status" -ne 0 ]] && ! grep -q 'CAIXA_FECHADO' "$tmp_dir/sale.log"; then
  cat "$tmp_dir/sale.log" >&2
  echo "Racing sale failed for a reason other than the cash session closing" >&2
  exit 1
fi

cash_race_result="$(psql "$DB_URL" -X -A -t -F '|' -v ON_ERROR_STOP=1 \
  -v product_id="$cash_race_product_id" <<'SQL'
select to_char(cs.closing_expected, 'FM9999999990.00'),
  (select count(*) from public.sales s where s.cash_session_id = cs.id),
  p.current_stock,
  (select to_char(coalesce(sum(cm.amount), 0)::numeric(12,2), 'FM9999999990.00')
   from public.cash_movements cm
   where cm.cash_session_id = cs.id and cm.movement_type = 'entrada')
from public.cash_sessions cs
cross join public.products p
where cs.status = 'closed'
  and cs.opening_note = 'cash-close concurrency test'
  and p.id = :'product_id'::uuid;
SQL
)"
if [[ "$sale_status" -eq 0 ]]; then
  expected_cash_race='22.00|1|0|2.00'
else
  expected_cash_race='20.00|0|1|0.00'
fi
if [[ "$cash_race_result" != "$expected_cash_race" ]]; then
  echo "Unexpected sale/close result: $cash_race_result (expected $expected_cash_race)" >&2
  exit 1
fi
echo "PASS: concurrent sale and cash close serialize without losing cash or stock updates"

logout_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --request POST "$API_URL/auth/v1/logout" \
  --header "apikey: $ANON_KEY" \
  --header "Authorization: Bearer $access_token")"
if [[ "$logout_status" != "204" ]]; then
  echo "Logout returned HTTP $logout_status, expected 204" >&2
  exit 1
fi
refresh_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --request POST "$API_URL/auth/v1/token?grant_type=refresh_token" \
  --header "apikey: $ANON_KEY" \
  --header "Content-Type: application/json" \
  --data "$(jq -n --arg refresh_token "$refresh_token" '{refresh_token: $refresh_token}')")"
if [[ "$refresh_status" != "400" ]]; then
  echo "Refresh after logout returned HTTP $refresh_status, expected 400" >&2
  exit 1
fi
echo "PASS: logout invalidates the refresh token"

if [[ "$DB_URL" != */postgres ]]; then
  echo "Unexpected local database URL; refusing to create a restore-test database" >&2
  exit 1
fi
restore_db="2k_gestao_restore"
postgres_container="$(docker ps --filter 'name=supabase_db_' --format '{{.Names}}' | head -n 1)"
if [[ -z "$postgres_container" ]]; then
  echo "Could not locate the ephemeral Supabase PostgreSQL container for backup restore" >&2
  exit 1
fi
docker exec "$postgres_container" pg_dump -U postgres -d postgres \
  --format=custom --no-owner --no-acl \
  --schema=public --schema=auth --schema=supabase_migrations --schema=extensions \
  --file=/tmp/2k-gestao.dump
docker cp "$postgres_container:/tmp/2k-gestao.dump" "$tmp_dir/2k-gestao.dump"
docker exec "$postgres_container" createdb -U postgres "$restore_db"
docker cp "$tmp_dir/2k-gestao.dump" "$postgres_container:/tmp/2k-gestao.dump"
docker exec "$postgres_container" pg_restore -U postgres --exit-on-error --no-owner --no-acl \
  --dbname="$restore_db" /tmp/2k-gestao.dump
restored_state="$(docker exec "$postgres_container" psql -U postgres -d "$restore_db" -X -q -A -t -F '|' -v ON_ERROR_STOP=1 -c \
  "select (select count(*) from supabase_migrations.schema_migrations), (select count(*) from auth.users), (select count(*) from public.profiles), (select count(*) from public.products), (select count(*) from public.cash_sessions where status = 'closed')")"
if [[ "$restored_state" != "8|2|2|2|1" ]]; then
  echo "Restored backup did not preserve migrations and representative data: $restored_state" >&2
  exit 1
fi
docker exec "$postgres_container" dropdb -U postgres "$restore_db"
docker exec "$postgres_container" rm -f /tmp/2k-gestao.dump
echo "PASS: application/Auth dump restored into a separate database with migrations and representative data intact"
