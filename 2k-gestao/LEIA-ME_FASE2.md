# 2K Gestão v1 — Fase 2: Produtos + Estoque

## Como aplicar
1. `git checkout -b feature/fase2-produtos-estoque`
2. Copie `src/` e `supabase/` para a raiz do projeto (mesclando pastas).
3. Rode a migration `supabase/migrations/0002_produtos_estoque.sql` (SQL Editor do Supabase ou `supabase db push`).
4. Rode os testes: `psql "$DATABASE_URL" -f supabase/tests/fase2_estoque.sql`
   (sucesso = mensagem final "todos os testes SQL passaram"; falha = erro `FALHOU Tn`).
5. `npm run typecheck && npm run build && npm run dev`
6. Se existirem páginas `ComingSoon` em `/produtos` e `/estoque`, apague-as (as novas páginas assumem essas rotas) e confirme que os links do menu apontam para elas.

## Premissas sobre o código da Fase 0+1 (ajuste se diferir)
- `public.profiles` tem as colunas `id`, `role` (`admin`/`technician`) e `active`; existem `is_active_user()` e `is_admin()`.
- `@/lib/supabase/server` exporta `createClient()` (async ou não) que devolve o cliente SSR com cookies.
- Área logada fica em `src/app/(app)/`, protegida pelo layout/middleware da Fase 1. Se o grupo tiver outro nome, mova as duas pastas de página.
- O nome do usuário no histórico tenta `full_name`, `name`, `display_name` ou `email` de `profiles`; se não houver nenhum, mostra "Usuário".

## Decisões de projeto
- **Saldo protegido em 3 camadas:** permissão por coluna (`current_stock` fora do GRANT), trigger que só libera dentro das RPCs, e RPCs `SECURITY DEFINER` com `SELECT … FOR UPDATE`.
- **Histórico imutável:** `stock_movements` não aceita insert/update/delete direto; só nasce pelas RPCs.
- **Permissões:** qualquer usuário ativo consulta estoque e histórico; entrada/ajuste manual e criar/editar produto/categoria exigem admin.
- **`apply_stock_change()`** é a função interna reutilizável; vendas (Fase 4) e OS (Fase 5) vão chamá-la com `reference_type`/`reference_id`.
- Dinheiro trafega como texto (`"12.50"`), nunca float. Produto nasce com estoque 0; o saldo inicial entra por "Entrada".
- Não há DELETE de produto nem de categoria: só inativar.

## Teste de concorrência (manual, 2 abas do SQL Editor)
Aba A: autentique como admin, então `begin; select add_stock('<id>', 5, 'A');` (não finalize)
Aba B: autentique como admin, então `select add_stock('<id>', 5, 'B');` → deve ficar esperando.
Aba A: `commit;` → a B conclui. Saldo final = inicial + 10, com dois movimentos encadeados (antes/depois consistentes).
(As RPCs exigem usuário logado; no SQL Editor simule com `select set_config('request.jwt.claims', '{"sub":"<uuid-do-admin>","role":"authenticated"}', false); set role authenticated;` em cada aba.)

## Checklist de aceite da Fase 2
- [ ] Testes SQL T1–T10 passam
- [ ] Concorrência manual validada
- [ ] Cadastrar produto → entra com estoque 0 → entrada de 10 → histórico mostra 0 → 10
- [ ] Ajuste −3 → 7; ajuste acima do saldo mostra erro e não altera nada
- [ ] Produto inativo não aceita movimentação; reativar volta ao normal
- [ ] Alerta de estoque baixo aparece em Produtos e na aba Estoque baixo
- [ ] Telas funcionam em ~360 px (cards no mobile, tabela no desktop)
- [ ] Usuário inativo/deslogado recebe 401/403 nas rotas `/api/*`
