# 2K Gestão v1

Aplicação interna da 2K Celulares para produtos, estoque, clientes, vendas, caixa e ordens de serviço. A base foi reconstruída a partir das decisões e especificações disponíveis; os fontes históricos originais não estavam no arquivo de referência. Migrations, Auth/RLS, T1–T10, testes SQL das Fases 3–5, concorrência e restore automatizado passaram em Supabase efêmero no GitHub Actions. Deploy e testes em dispositivos continuam pendentes; consulte `STATUS_EXECUCAO.md`.

## Stack e limites

- Next.js 15 App Router, React 19, TypeScript strict e Tailwind CSS 3.4.
- Supabase Auth, SSR, PostgreSQL e RLS.
- Uma empresa/loja na V1. Não há isolamento SaaS/multi-tenant, emissão fiscal, fiado, pagamentos online, contabilidade ou funcionamento offline transacional.
- Nenhuma senha de aparelho é persistida. A equipe combina o desbloqueio diretamente com o cliente.
- A aplicação não usa `service_role`; o acesso a dados passa pela sessão Supabase e pelas policies/RPCs.

## Configuração local

Requer Node.js 22 LTS (Node 20+ pode funcionar), npm e projeto Supabase de teste/desenvolvimento.

```powershell
Copy-Item .env.example .env.local
```

Preencha somente as credenciais públicas:

```text
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA_ANON
```

Nunca adicione `service_role`, senha de banco ou credenciais reais ao Git. Instale e valide:

```text
npm ci
npm run typecheck
npm run build
npm run dev
```

## Banco e permissões

Aplique em ordem somente em banco local ou projeto de teste autorizado:

1. `supabase/migrations/0001_profiles.sql`
2. `supabase/migrations/0002_produtos_estoque.sql`
3. `supabase/migrations/0003_fase2_admin_stock_permissions.sql`
4. `supabase/migrations/0004_customers.sql`
5. `supabase/migrations/0005_sales_and_cash.sql`
6. `supabase/migrations/0006_service_orders.sql`
7. `supabase/migrations/0007_dashboard_read_model.sql`
8. `supabase/migrations/0008_role_scoped_read_permissions.sql`

Crie os usuários em Supabase → Authentication → Users. A trigger cria cada usuário inicialmente como `technician`; promova Kayky e Edson somente por operação administrativa segura:

```sql
update public.profiles p set name = 'Kayky', role = 'admin', active = true
from auth.users u where p.id = u.id and u.email = 'EMAIL_DO_KAYKY';

update public.profiles p set name = 'Edson', role = 'admin', active = true
from auth.users u where p.id = u.id and u.email = 'EMAIL_DO_EDSON';
```

Confirme o e-mail e a identidade antes de executar. Não coloque e-mails reais neste arquivo. O administrador abre/fecha o caixa, registra movimento manual, consulta/finaliza/cancela vendas, cadastra produtos/clientes e controla OS. Technician não tem acesso a dados de venda/caixa; consulta clientes e OS, mas só altera status/diagnóstico e consome peças em OS atribuída; não cancela OS nem altera valores.

### Supabase local de teste

O repositório inclui `supabase/config.toml`. Para criar um ambiente local descartável, instale e inicie Docker Desktop (ou Podman), depois suba os serviços necessários:

```powershell
npx supabase start
npx supabase status
npx supabase db reset --local --no-seed
```

`db reset` recria o banco local e aplica as migrations versionadas. Para executar a suíte integrada (provisiona usuários descartáveis, testa Auth/RLS, profile ausente/inativo, T1–T10, vendas/OS, operações concorrentes e dump/restore dos schemas de aplicação/Auth em banco separado), instale `psql`, `curl`, `jq` e `openssl`; as ferramentas de backup/restore são executadas dentro do container Postgres 17. Rode no Bash:

```bash
bash supabase/tests/validate_local.sh
```

O workflow GitHub Actions executa a mesma suíte em Supabase efêmero por PR e push. Configure `.env.local` apenas com a URL local e a chave `anon` mostradas pelo status; nunca use nem copie a chave `service_role` para o app. Não aponte esses comandos para produção ou para um projeto remoto sem autorização explícita.

### Testes de banco

Os scripts usam transação e `ROLLBACK`. O teste Fases 3–5 precisa de pelo menos um profile `admin` e um `technician` ativos; execute apenas em instância de teste:

```text
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fase2_estoque.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fase3_5_clientes_vendas_caixa_os.sql
```

Eles cobrem regras SQL essenciais. A suíte CI também executa Auth/RLS end-to-end, concorrência e restore isolado dos schemas de aplicação/Auth. Testes de navegador e um ensaio de recuperação no provedor de produção continuam pendentes.

## Rotinas operacionais

**Abertura e fechamento:** admin confere o fundo inicial, abre `/caixa`, registra despesas/retiradas com motivo e confere o valor físico antes do fechamento. O esperado/diferença são calculados novamente no banco. Recebimentos PIX/cartão não entram no saldo físico da gaveta.

**Venda:** admin confirma itens e quantidades, cliente opcional, desconto e forma de pagamento; venda só finaliza com caixa aberto. Preço/custo e estoque vêm do banco. Para cancelar, informar motivo; venda e histórico não são apagados e estoque/caixa são estornados.

**Estoque:** admin registra entrada ou ajuste com motivo. Não altere `current_stock` por SQL ou API direta. Conferências e histórico ficam disponíveis em `/estoque`.

**OS:** registre cliente, aparelho e defeito relatado; atribua um técnico. Registre diagnóstico/serviço, use as transições de status e adicione peças pela busca da própria OS para que o estoque seja movimentado. Entrega e cancelamento preservam histórico. Não registre senha de aparelho.

Checklist diário para Kayky e Edson:
- iniciar sessão individual e conferir o usuário ativo;
- verificar caixa aberto antes de iniciar vendas;
- associar pagamentos às formas recebidas;
- registrar todas as entradas/ajustes com motivo;
- atribuir OS ao técnico responsável e registrar peças dentro da OS;
- fechar o caixa contando dinheiro físico e conferindo diferença;
- exportar CSV somente para finalidade autorizada e guardar em local protegido.

## Exportação, PWA e offline

Os CSVs usam UTF-8 com BOM, aspas e delimitador `;`; células iniciadas por fórmula são neutralizadas. A exportação de CPF/telefone dos clientes exige admin. O manifest permite instalação onde o navegador suportar. A aplicação não armazena dados para operação offline e bloqueia mutações ao detectar ausência de conexão.

## CI, deploy e recuperação

O workflow raiz `.github/workflows/validate-2k-gestao.yml` usa Node 22, `npm ci`, typecheck e build. Deploy exige configurar as variáveis públicas no host e as URLs de redirecionamento Auth no Supabase, HTTPS e um projeto Supabase apropriado. Nenhum deploy pago foi autorizado ou executado.

Faça backup periódico do banco Supabase pelo mecanismo de backup do projeto ou por dump PostgreSQL em ambiente protegido. Não armazene dumps com PII em Git. Antes de confiar em um backup, restaure-o em um projeto de teste separado e valide Auth, migrations e dados essenciais. Em incidente, preserve o banco original, restaure em instância isolada, valide o aplicativo e somente então planeje a troca de tráfego. Migrations aplicadas em ambiente persistente não devem ser reescritas; correções são migrations incrementais.

Consulte `STATUS_EXECUCAO.md` para o estado de validação real, pendências e bloqueios de infraestrutura.
