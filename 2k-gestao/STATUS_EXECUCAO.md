# Status de execução — 2K Gestão v1

## Estado oficial

**Banco/Auth/RLS, backup/restore automatizado e Fases 0–2: VALIDADOS em Supabase efêmero no GitHub Actions.** Migrations `0001–0008`, T1–T10, testes SQL das Fases 3–5, corridas concorrentes e restauração dos schemas de aplicação/Auth passaram. A aplicação ainda não está declarada pronta para produção: deploy e testes de navegador/mobile não foram executados.

| Fase | Estado | Evidência / limite |
|---|---|---|
| 0 — Fundação | VALIDADA | Estrutura e migrations aplicadas em banco limpo; os fontes históricos originais não estavam no JSON de referência. |
| 1 — Auth, RLS e layout | VALIDADA NO BANCO | Login válido/inválido, sessão, logout/refresh, profiles, usuário inativo, admin/technician e políticas anon/autenticado exercitados. Testes de navegador não executados. |
| 2 — Produtos + Estoque | VALIDADA | Migrations 0002–0003 e T1–T10 passaram; concorrência de saldo confirmou locks, saldo final e histórico. |
| 3 — Clientes | TESTES SQL PASS; UI NÃO TESTADA | Migration 0004, normalização e unicidade parcial de CPF verificadas na suíte transacional. |
| 4 — Vendas + Caixa | TESTES SQL PASS; UI NÃO TESTADA | Migration 0005, venda, pagamentos, caixa, cancelamento e estorno verificados; corrida venda vs. fechamento passou. |
| 5 — Ordens de serviço | TESTES SQL PASS; UI NÃO TESTADA | Migration 0006, transições, atribuição, peças/estornos, histórico e limites de technician verificados. Senha do aparelho não é armazenada. |
| 6 — Dashboard | MIGRATION APLICADA; UI NÃO TESTADA | Migrations 0007–0008 aplicadas; build passou. Consultas e fluxos do dashboard não tiveram teste de navegador dedicado. |
| 7 — PWA/CSV/CI/docs | BUILD/CI E BACKUP/RESTORE PASS; OPERAÇÃO PARCIAL | Manifest/ícones, CSV e documentação existem; CI e restore isolado dos schemas de aplicação/Auth passaram. Deploy e teste em dispositivos não executados. |

## Validação e auditoria do ambiente — 2026-10-16

**Resultado final da validação automatizada: PASS** no run GitHub Actions `38871226985` (jobs `validate` e `database`, ambos concluídos com sucesso). O banco foi efêmero, criado pelo runner Ubuntu/Docker e descartado ao final; não foi usado projeto remoto nem produção.

| Verificação | Resultado observado |
|---|---|
| `npm ci` | **PASS** local e no job `validate`; lockfile instalado. Auditoria anterior reportou 5 vulnerabilidades HIGH na árvore completa. |
| `npm run typecheck` | **PASS** local e no job `validate`. |
| `npm run build` | **PASS** local e no job `validate` — Next.js 15.5.28 compilou e gerou as páginas e rotas de API. |
| Smoke de produção | **PASS nesta auditoria**: `/setup`, `/manifest.webmanifest`, `/icons/icon-192.png` e `/icons/icon-512.png` responderam HTTP 200; JSON do manifest e referências aos dois PNG conferidos. |
| `npm audit --omit=dev` | **PASS**, 0 vulnerabilidades reportadas na árvore de produção. |
| Auditoria completa | **5 HIGH** em dependências de desenvolvimento relacionadas ao Tailwind 3. `npm audit fix --force` propõe Tailwind 4; não executar neste ciclo. |
| GitHub Actions (app) | **PASS** — workflow `Validate 2K Gestão` executou `npm ci`, typecheck e build no PR e no merge para `main`. |
| Supabase CLI | **PASS**, versão `2.121.0` executada no runner Ubuntu. |
| `supabase start` no runner | **PASS** — serviços efêmeros iniciados; desligados ao final do job. |
| Execução local de Supabase | **BLOCKED** — máquina Windows continua sem Docker/Podman. |
| Docker / Podman | **Indisponíveis** — comandos não estão no PATH, instalações convencionais não encontradas e serviços não instalados. |
| WSL | Executável presente, mas **não instalado** (`wsl --status` informa ausência do Subsistema Windows para Linux); nenhuma distro disponível. |
| `psql` | **Indisponível** — não encontrado no PATH nem nas instalações PostgreSQL comuns verificadas. |
| Credenciais Supabase | **Não configuradas** — nenhuma variável Supabase/Database observada no ambiente e `2k-gestao/.env.local` não existe. |
| Projeto Supabase remoto | **Não vinculado** — `supabase/.temp/project-ref` inexistente; não há URL/chave de projeto de teste. |
| Configuração Supabase | `supabase/config.toml` adicionada; job GitHub Actions validado com execução real no runner. |
| MCP/conector de banco | Nenhum Supabase MCP conectado nesta sessão. O catálogo encontrou um candidato Supabase MCP de risco alto, mas ele não está instalado/configurado e exige avaliação/autorização e credenciais; não oferece banco sem projeto. |
| Banco temporário na CI | **PASS** — banco local descartável no runner; nenhuma credencial remota utilizada. |
| Migrations aplicadas | **PASS** — 0001–0008, em ordem, em banco limpo. |
| Auth | **PASS** — senha inválida rejeitada; login/sessão válidos para admin e technician; profile technician lido pelo próprio usuário; profile ausente e usuário inativo sem acesso; logout revogou refresh token. |
| RLS e permissões | **PASS** — testes SQL anon/authenticated/admin/technician; technician sem acesso financeiro ou mutação manual de estoque. |
| T1–T10 | **PASS** — `supabase/tests/fase2_estoque.sql` concluiu todos os testes e rollback. |
| Fases 3–5 | **PASS** — testes transacionais de clientes, vendas, caixa, OS, peças, cancelamento e RBAC concluídos e revertidos. |
| Concorrência | **PASS** — duas entradas e duas baixas concorrentes no mesmo produto, uma baixa rejeitada, saldo/histórico consistentes; venda vs. fechamento do caixa sem perda de saldo ou estoque. |
| Backup/restore | **PASS** — dump custom dos schemas `public`, `auth`, `supabase_migrations` e `extensions`; restore em banco separado; migrations e contagens representativas de usuários, profiles, produtos e caixa conferidas. |
| Tentativas de CI anteriores | Execuções iniciais identificaram e corrigiram fixture de technician, interpolação/saída do `psql`, versão incompatível do `pg_dump` e preparação do schema de restore. A execução completa mais recente passou. Nenhuma dessas falhas está pendente. |
| Pacote final | `2K-Gestao-v1-FINAL.zip` — 89 arquivos; conteúdo e exclusões verificados após a geração deste relatório. |

## Varredura estática direcionada

- Nenhum arquivo `.env.local`, chave `service_role` ou segredo foi encontrado entre os arquivos versionados; `.env.example` contém apenas placeholders públicos.
- Nenhuma ocorrência de `any` ou `COUNT(*) + 1` foi encontrada nos padrões examinados. O único `ComingSoon` em rota é `/configuracoes`, fora dos módulos implementados das Fases 3–7.
- As funções `SECURITY DEFINER` encontradas definem `search_path`; as referências às tabelas no SQL são qualificadas com `public`. Migrations, Auth/RLS e regras exercitadas passaram na suíte do runner; isso não substitui uma revisão independente de segurança.
- Preço e custo de venda são lidos dos produtos no banco; sequência de vendas usa sequence; pagamentos PIX/cartão não alimentam a gaveta física; cancelamento da venda registra reversão dentro da transação.
- O caminho de alteração de saldo no SQL é a função `apply_stock_change`; buscas estáticas não encontraram atualização direta de `current_stock` na aplicação.
- A suíte T1–T10 e os testes transacionais Fases 3–5 passaram no runner efêmero; concorrência de estoque e venda/fechamento também passou.

## Snapshot do repositório

- Branch de validação: `validate-supabase-database`.
- Commit testado pelo run `38871226985`: `8d67c57` (`Restore into a clean public schema`), baseado na `main` `ffaa402`.
- Tag `v1.0.0`: não criada; o trabalho de validação está em revisão; deploy e ensaio operacional no provedor permanecem pendentes.

## Migrations e testes SQL

| Item | Resultado |
|---|---|
| 0001–0008 em banco limpo | **PASS** — aplicadas e verificadas em ordem no run `38871226985` |
| T1–T10 (Fase 2) | **PASS** — script SQL completo |
| Testes SQL Fases 3–5 | **PASS** — script transacional completo |
| Auth, sessão, login/logout e usuário inativo | **PASS** — admin e technician; profile ausente/inativo; refresh revogado |
| RLS, admin/technician e acesso anônimo | **PASS** — SQL sob roles/JWT claims e requests REST autenticados |
| Venda concorrente vs fechamento de caixa | **PASS** — estado final coerente em ambas as ordens possíveis |
| Concorrência de estoque | **PASS** — atualizações serializadas, sem saldo negativo nem perda de histórico |
| Concorrência de numeração de vendas | NÃO TESTADA isoladamente; sequence existe e não usa `COUNT(*) + 1` |
| Backup/restore dos schemas de aplicação/Auth | **PASS** — dump e restore em banco separado, com validação de migrations e dados representativos |
| Testes de navegador/mobile | NÃO EXECUTADOS |
| Isolamento entre empresas | NÃO APLICÁVEL — V1 é de uma empresa, sem multi-tenant |
| Deploy | NÃO EXECUTADO — host/credenciais não autorizados |
| Recuperação operacional no provedor | NÃO EXECUTADA — o restore automatizado em banco separado passou; não houve restore num projeto de provedor |

## Riscos e decisões

- A validação automatizada de banco e o restore isolado passaram; ainda não houve deploy nem testes de navegador/mobile.
- Aplicar apenas em projeto local/de teste autorizado; não usar produção para testes. Não editar migrations já aplicadas em ambiente persistente: criar migration incremental.
- Admin executa operações financeiras e cadastro. Technician consulta vendas/caixa e só opera em OS atribuída; não altera valores nem cancela OS.
- Vendas exigem caixa aberto, usam preço/custo atuais do banco e não aceitam saldo ou preço do cliente. Cancelamento precisa de motivo e registra reversões sem apagar venda.
- Exportação de clientes com CPF/telefone é admin-only. CSV neutraliza células que podem ser interpretadas como fórmula.
- Operações de mutação são bloqueadas quando o navegador detecta ausência de conexão; não existe fila offline.
- V1 não implementa SaaS/multi-tenant, multi-loja, documentos fiscais, fiado, pagamentos online ou senha de aparelho.
- 5 HIGH de desenvolvimento do Tailwind 3 permanecem como dívida técnica; não migrar para Tailwind 4 neste ciclo.

## Próxima ação exata

Próxima etapa: concluir revisão/integração das alterações de validação; depois, antes de produção, executar smoke test em navegador/dispositivo e um ensaio operacional de backup/restauração no provedor autorizado. **Fases 0–2, migrations/Auth/RLS, testes SQL, concorrência e restore automatizado estão validados; deploy e operação em dispositivos permanecem pendentes.**
