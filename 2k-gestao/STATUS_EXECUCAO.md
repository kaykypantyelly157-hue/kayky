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

## Validação e auditoria do ambiente — 2026-10-16

**Aplicação: PASS. Banco/Auth/RLS: BLOCKED por falta de runtime de banco.** Esta execução confirma build e smoke test, não valida migrations, policies nem transações no PostgreSQL.

| Verificação | Resultado observado |
|---|---|
| `npm ci` | **PASS**, lockfile instalado; npm reportou 5 vulnerabilidades HIGH na árvore completa. |
| `npm run typecheck` | **PASS**. |
| `npm run build` | **PASS** — Next.js 15.5.28 compilou e gerou as páginas e rotas de API. |
| Smoke de produção | **PASS nesta auditoria**: `/setup`, `/manifest.webmanifest`, `/icons/icon-192.png` e `/icons/icon-512.png` responderam HTTP 200; JSON do manifest e referências aos dois PNG conferidos. |
| `npm audit --omit=dev` | **PASS**, 0 vulnerabilidades reportadas na árvore de produção. |
| Auditoria completa | **5 HIGH** em dependências de desenvolvimento relacionadas ao Tailwind 3. `npm audit fix --force` propõe Tailwind 4; não executar neste ciclo. |
| GitHub Actions (app) | **PASS** — workflow `Validate 2K Gestão` executou `npm ci`, typecheck e build no PR e no merge para `main`. |
| Supabase CLI | **Disponível**, versão `2.121.0` via `npm exec`. |
| `npx supabase start` / `status` | **BLOCKED** — CLI retorna `docker: command not found (podman also not found)`. |
| Docker / Podman | **Indisponíveis** — comandos não estão no PATH, instalações convencionais não encontradas e serviços não instalados. |
| WSL | Executável presente, mas **não instalado** (`wsl --status` informa ausência do Subsistema Windows para Linux); nenhuma distro disponível. |
| `psql` | **Indisponível** — não encontrado no PATH nem nas instalações PostgreSQL comuns verificadas. |
| Credenciais Supabase | **Não configuradas** — nenhuma variável Supabase/Database observada no ambiente e `2k-gestao/.env.local` não existe. |
| Projeto Supabase remoto | **Não vinculado** — `supabase/.temp/project-ref` inexistente; não há URL/chave de projeto de teste. |
| Configuração Supabase local | `supabase/config.toml` **adicionada**; o runner GitHub Actions tem um job para subir ambiente efêmero, aplicar migrations e executar a suíte integrada. Esse job ainda não foi executado. |
| MCP/conector de banco | Nenhum Supabase MCP conectado nesta sessão. O catálogo encontrou um candidato Supabase MCP de risco alto, mas ele não está instalado/configurado e exige avaliação/autorização e credenciais; não oferece banco sem projeto. |
| Banco temporário na CI | Job Supabase local adicionado ao workflow; **pendente de execução** num runner GitHub Actions com Docker. |
| Migrations aplicadas | **0** — nenhuma migration executada nesta sessão. |
| Auth/RLS/estoque/vendas/OS/concorrência via CI | **PENDING** — `supabase/tests/validate_local.sh` foi adicionado; somente o resultado do runner poderá confirmar os testes. |
| Pacote final | `2K-Gestao-v1-FINAL.zip` gerado e verificado: contém código, documentação, migrations, testes SQL e workflow; exclui `.env.local`, secrets, `node_modules`, `.next` e caches. |

## Varredura estática direcionada

- Nenhum arquivo `.env.local`, chave `service_role` ou segredo foi encontrado entre os arquivos versionados; `.env.example` contém apenas placeholders públicos.
- Nenhuma ocorrência de `any` ou `COUNT(*) + 1` foi encontrada nos padrões examinados. O único `ComingSoon` em rota é `/configuracoes`, fora dos módulos implementados das Fases 3–7.
- As funções `SECURITY DEFINER` encontradas definem `search_path`; as referências às tabelas no SQL são qualificadas com `public`. As policies e o comportamento, porém, permanecem **não executados**.
- Preço e custo de venda são lidos dos produtos no banco; sequência de vendas usa sequence; pagamentos PIX/cartão não alimentam a gaveta física; cancelamento da venda registra reversão dentro da transação.
- O caminho de alteração de saldo no SQL é a função `apply_stock_change`; buscas estáticas não encontraram atualização direta de `current_stock` na aplicação.
- A suíte T1–T10 e os testes transacionais Fases 3–5 existem, mas não foram executados. Foi adicionada uma suíte para teste concorrente multi-sessão no runner; ainda não existe resultado de execução.

## Snapshot do repositório

- Branch do checkout: `kaykypantyelly157-hue-verbose-couscous`.
- Commit do checkout: `bb51e9c` (`Implement FinOS V1 phases 3-7`), ancestral da `main` atual (`ffaa402`).
- Tag apontada pelo commit do checkout: nenhuma.

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

Executar o novo job `database` do GitHub Actions, que usa Docker efêmero do runner, inicializa o Supabase, aplica migrations `0001–0008` em banco limpo e executa Auth/RLS, T1–T10, testes de Fases 3–5 e concorrência. Se a execução falhar, corrigir e repetir; se o runner não conseguir subir Supabase, instalar Docker Desktop (ou Podman) local e executar `bash supabase/tests/validate_local.sh`. Até obter PASS real, manter as Fases 0–2 **PARCIAIS** e a V1 **não validada no banco**.
