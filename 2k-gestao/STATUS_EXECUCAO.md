# Status de execução — 2K Gestão v1

## Estado oficial

**V1: IMPLEMENTADA NO CÓDIGO, AINDA PARCIAL / NÃO VALIDADA NO BANCO.** As Fases 3–7 foram construídas sem executar migrations ou testes em Supabase. Não declarar Fases 0–2 validadas, Auth/RLS integrados validados ou V1 pronta para produção.

| Fase | Estado | Evidência / limite |
|---|---|---|
| 0 — Fundação | PARCIAL | Base reconstruída a partir das especificações; os fontes históricos originais não estavam no JSON. |
| 1 — Auth, RLS e layout | IMPLEMENTADA, NÃO VALIDADA | Login/logout, profiles, middleware e policies existem; Auth real, usuários inativos e RLS não foram exercitados. |
| 2 — Produtos + Estoque | IMPLEMENTADA, NÃO VALIDADA NO BANCO | Código e migrations 0002–0003 existentes; T1–T10 e concorrência ainda não executados. |
| 3 — Clientes | IMPLEMENTADA NO CÓDIGO, NÃO VALIDADA | Migration 0004, normalização/CPF único parcial, API, RLS e UI de busca/cadastro. |
| 4 — Vendas + Caixa | IMPLEMENTADA NO CÓDIGO, NÃO VALIDADA | Migration 0005 e permissões incrementais em 0008; RPCs transacionais, caixa, pagamentos, estoque, histórico, cancelamento e telas. Admin-only. |
| 5 — Ordens de serviço | IMPLEMENTADA NO CÓDIGO, NÃO VALIDADA | Migration 0006, status explícitos, peças/estornos, atribuição e histórico; senha do aparelho não é armazenada. |
| 6 — Dashboard | IMPLEMENTADA NO CÓDIGO, NÃO VALIDADA | Dados reais via sessão/RLS, indicadores e caixa; dia de negócio em `America/Sao_Paulo`; migrations 0007–0008 para resumo agregado e escopo de roles. |
| 7 — PWA/CSV/CI/docs | IMPLEMENTADA NO CÓDIGO, NÃO VALIDADA | Manifest/ícone, aviso e bloqueio de mutações offline, CSV com BOM e neutralização de fórmulas, CI com `npm ci`, documentação. Deploy não executado. |

## Validações executadas

- `npm install --no-audit --progress=false`: OK anteriormente; lockfile existe.
- `npm run typecheck`: **PASS** após as últimas mudanças de permissões, exportação e referência financeira.
- `npm run build`: **PASS** — Next.js 15.5.28 compilou e gerou as páginas e rotas de API.
- Smoke test do build de produção: **PASS** — `/setup`, `/manifest.webmanifest`, `/icons/icon-192.png` e `/icons/icon-512.png` retornaram HTTP 200; JSON do manifest e declarações dos dois ícones PNG conferidos.
- Varredura estática direcionada: a busca por `service_role` encontrou apenas comentário explicativo; os padrões SQL pesquisados para atualização direta de `current_stock` não retornaram correspondências.
- `npm audit --omit=dev`: resultado anterior PASS, sem vulnerabilidades reportadas na árvore de produção.
- `npm audit` completo: resultado anterior com 5 HIGH na árvore de desenvolvimento relacionada ao Tailwind 3; mantido como dívida técnica separada. Tailwind 4 não foi adotado.
- Supabase CLI `2.121.0` estava disponível via `npx`; tentativa anterior de `supabase start` bloqueada por falta de Docker/Podman.
- Ambiente conhecido: Node.js 24.20.0/npm 11.19.0; workflow configurado para Node 22, ainda não executado nesta sessão.
- Nenhum Supabase local/remoto autorizado, `psql` ou credencial `.env.local` foi disponibilizado. Nenhuma migration foi aplicada nesta sessão.

## Migrations e testes SQL

| Item | Resultado |
|---|---|
| 0001 profiles/Auth/RLS | BLOCKED — não aplicada |
| 0002 produtos/estoque | BLOCKED — não aplicada |
| 0003 permissões manuais de estoque | BLOCKED — não aplicada |
| 0004 clientes | BLOCKED — não aplicada |
| 0005 vendas/caixa | BLOCKED — não aplicada |
| 0006 ordens de serviço | BLOCKED — não aplicada |
| 0007 resumo do caixa para dashboard | BLOCKED — não aplicada |
| 0008 permissões de leitura por role | BLOCKED — não aplicada |
| Banco limpo e ordem 0001–0008 | BLOCKED — sem Postgres/Supabase de teste |
| T1–T10 (Fase 2) | BLOCKED — `supabase/tests/fase2_estoque.sql` não executado |
| Testes SQL Fases 3–5 | BLOCKED — `supabase/tests/fase3_5_clientes_vendas_caixa_os.sql` não executado |
| Auth, sessão, login/logout e usuário inativo | BLOCKED — sem Auth Supabase executável |
| RLS, admin/technician e acesso anônimo | BLOCKED — sem banco para execução |
| Venda concorrente vs fechamento de caixa | BLOCKED — exige sessões concorrentes reais |
| Concorrência de saldo e numeração | BLOCKED — exige execução concorrente |
| Testes de navegador/mobile | NÃO EXECUTADOS |
| Isolamento entre empresas | NÃO APLICÁVEL — V1 é de uma empresa, sem multi-tenant |
| Deploy e restore de backup | NÃO EXECUTADOS — host/credenciais não autorizados |

## Riscos e decisões

- A execução de migrations, transações, RLS, Auth e concorrência permanece o principal bloqueio. Typecheck/build não substituem esses testes.
- Aplicar apenas em projeto local/de teste autorizado; não usar produção para testes. Não editar migrations já aplicadas em ambiente persistente: criar migration incremental.
- Admin executa operações financeiras e cadastro. Technician consulta vendas/caixa e só opera em OS atribuída; não altera valores nem cancela OS.
- Vendas exigem caixa aberto, usam preço/custo atuais do banco e não aceitam saldo ou preço do cliente. Cancelamento precisa de motivo e registra reversões sem apagar venda.
- Exportação de clientes com CPF/telefone é admin-only. CSV neutraliza células que podem ser interpretadas como fórmula.
- Operações de mutação são bloqueadas quando o navegador detecta ausência de conexão; não existe fila offline.
- V1 não implementa SaaS/multi-tenant, multi-loja, documentos fiscais, fiado, pagamentos online ou senha de aparelho.
- 5 HIGH de desenvolvimento do Tailwind 3 permanecem como dívida técnica; não migrar para Tailwind 4 neste ciclo.

## Próxima ação exata

Disponibilizar Docker/Podman + Supabase CLI local ou projeto Supabase de teste autorizado e credenciais fora do Git. Aplicar migrations 0001–0008 em banco limpo; executar T1–T10 e os testes SQL das Fases 3–5; validar Auth, RLS, usuários/roles, transações, estoque, caixa, OS, concorrência e fluxos no navegador. Registrar PASS/FAIL/BLOCKED com evidência real. Somente depois considerar as Fases 0–2 validadas ou a V1 pronta para produção.
