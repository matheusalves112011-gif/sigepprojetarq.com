# SIGEP PROJETARQ

Sistema Integrado de Gestão de Projetos, Engenharia e Arquitetura.

Estado atual: **Fase 3 (Gestão)** — além da estrutura da Fase 2 (autenticação, usuários, permissões, auditoria),
estão implementados clientes, propostas, contratos, projetos, tramitação, disciplinas e tarefas, com indicadores
reais no dashboard. Os módulos de operação (Fase 4: financeiro, documentos/OneDrive, calendário, relatórios)
aparecem no menu sem link.

## Tecnologias

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL 16 · Drizzle ORM ·
Better Auth (sessões no banco, senhas Argon2id) · Zod · Vitest · Puppeteer (testes de ponta a ponta).

As decisões técnicas e suas justificativas estão em [docs/DECISOES.md](docs/DECISOES.md).

## Como rodar em desenvolvimento

Requisitos: Node.js 22, pnpm 10, PostgreSQL 16.

```bash
pnpm install
cp .env.example .env        # preencha DATABASE_URL, BETTER_AUTH_SECRET e SETUP_TOKEN
pnpm db:migrate             # aplica as migrações versionadas de ./drizzle
pnpm dev                    # http://localhost:3000
```

No primeiro acesso o sistema abre `/instalacao`. Informe o `SETUP_TOKEN` e crie o administrador principal.
A tela deixa de existir depois disso. Não há usuário nem senha padrão.

## Banco de dados

- O esquema fica em `src/db/schema.ts`.
- Para alterar: edite o esquema, rode `pnpm db:generate --name descricao` e revise o SQL gerado em `./drizzle`.
- `pnpm db:migrate` aplica as migrações pendentes (use `ENV_FILE=.env.test pnpm db:migrate` para o banco de testes).
- Nunca edite uma migração já aplicada; crie outra.

## Testes

```bash
pnpm lint && pnpm typecheck
pnpm test                   # unitários + integração (PostgreSQL real, banco *_test recriado a cada arquivo)
pnpm build && pnpm test:e2e # ponta a ponta no servidor de produção, em Chrome sem interface
```

Os testes de integração e de ponta a ponta usam `.env.test` e recusam qualquer banco cujo nome não termine em `_test`.
As capturas de tela dos testes de ponta a ponta ficam em `tests/e2e/screenshots/`.

## Estrutura

```
drizzle/                 migrações SQL versionadas
src/db/                  esquema e conexão
src/lib/                 ambiente, autenticação, sessão, RBAC, e-mail, senha
src/modules/             regras de negócio (auth, users, audit, clients, proposals, contracts, projects,
                         workflow, disciplines, tasks, dashboard) — toda gravação passa por aqui
src/app/(public)/        login, recuperação de senha, instalação
src/app/(senha)/         troca obrigatória da senha provisória
src/app/(app)/           área autenticada: dashboard, clientes, propostas, contratos, projetos, tramitação,
                         disciplinas, tarefas, usuários, permissões, auditoria, conta
src/components/          menu lateral, formulários, componentes de interface
src/proxy.ts             redireciona para o login quem não tem cookie de sessão
tests/                   unit, integration, e2e
```

## Regras de segurança já implementadas e testadas

- Senhas em Argon2id; mínimo de 10 caracteres com letra e número.
- Sessão em cookie `HttpOnly`, `SameSite=Lax` (e `Secure` sob HTTPS), validada no banco a cada requisição.
- Bloqueio temporário após 5 falhas de login por conta (ou 30 por IP) em 15 minutos.
- Permissão verificada no servidor em toda página e toda ação; o menu apenas reflete o resultado.
- Um único administrador principal, garantido por índice no banco; não pode ser bloqueado nem rebaixado.
- Usuário bloqueado perde as sessões na hora.
- Auditoria somente de inserção, garantida por gatilho no banco, gravada na mesma transação da alteração.

## Regras de negócio da Fase 3 (todas com teste automatizado)

- **Acesso por projeto:** o administrador vê tudo; os demais só os projetos em que são responsáveis ou autorizados.
  Projeto sem acesso responde como inexistente (404). Vale também para etapas, disciplinas e tarefas.
- **Permissão no serviço:** cada regra de negócio verifica a permissão do perfil (`authorize`), além da tela.
- **Valores:** propostas e contratos só mostram valores a quem vê o Financeiro ou pode criar/editar o módulo.
- **Clientes:** CPF/CNPJ com dígitos verificadores (CNPJ alfanumérico aceito), sem duplicidade; exclusão lógica só sem vínculos.
- **Propostas:** rascunho → enviada → aceita/recusada; só rascunho é alterado ou excluído; vencida não é aceita.
- **Contratos:** uma proposta aceita gera no máximo um contrato, do mesmo cliente; vigente exige assinatura, início e valor;
  não encerra nem cancela com projeto em andamento.
- **Projetos:** código anual automático; nascem com as etapas do fluxo da modalidade; modalidade sem fluxo definido não cria projeto.
- **Tramitação:** avanço conclui a etapa e inicia a seguinte; não avança com tarefa em aberto na etapa; devolução exige
  justificativa e a permissão "Aprovar"; histórico somente de inserção (gatilho no banco).
- **Tarefas e disciplinas:** responsável precisa ter acesso ao projeto; projeto encerrado trava alterações.
