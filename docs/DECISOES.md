# Registro de decisões técnicas

Cada decisão traz data, contexto e consequência. Decisões novas entram no fim; nenhuma é apagada.

## D-01 · Decisões do planejamento aceitas — 16/11/2026
O administrador aceitou as decisões D1 a D8 do planejamento da Fase 1 (VPS KVM 2, Caddy, conexão única com o
OneDrive, login próprio por e-mail e senha, backup externo compatível com S3, repositório privado no GitHub,
SMTP de caixa do domínio, 14 etapas mapeadas nas 12 pastas).

## D-02 · Domínio — 16/11/2026
Domínio informado pelo administrador: `sigepprojetarq.com` (produção). Proposta para testes: `teste.sigepprojetarq.com`.

## D-03 · Drizzle ORM no lugar do Prisma — 16/11/2026
**Contexto.** As migrações do Prisma dependem de um componente baixado de `binaries.prisma.sh`. Esse endereço é
bloqueado pela política de rede do ambiente de desenvolvimento, o que impediria gerar, aplicar e testar migrações.
**Decisão.** Substituir o Prisma pelo Drizzle ORM, com aprovação do administrador (exigida pela seção 2 do prompt).
**Consequência.** Continuam valendo PostgreSQL, migrações SQL versionadas (pasta `drizzle/`), integridade referencial
e relacionamentos estruturados. Nenhuma outra tecnologia mudou.

## D-04 · Renderização a cada requisição, sem Cache Components — 16/11/2026
O Next.js 16 traz Cache Components ligado no projeto novo. Como toda tela do SIGEP é autenticada e depende do
usuário, a aplicação usa renderização dinâmica (`dynamic = "force-dynamic"` no layout raiz). Isso evita que qualquer
página seja gerada no build com dados do banco — na primeira compilação, `/instalacao` e `/login` foram
pré-renderizadas como estáticas, o que foi detectado e corrigido antes dos testes.

## D-05 · Autenticação só por ações de servidor — 16/11/2026
O Better Auth (1.7) foi confirmado compatível com Next.js 16. A rota HTTP genérica `/api/auth/*` **não** é exposta:
login, logout, recuperação e troca de senha passam por ações de servidor que chamam a biblioteca diretamente.
Assim não existe endpoint público de cadastro e todo login passa pelo limite de tentativas e pela auditoria.

## D-06 · Perfis como enumeração; um único administrador principal — 16/11/2026
Os três perfis (`ADMIN_PRINCIPAL`, `OPERACIONAL`, `CONSULTA`) são um tipo enumerado do banco, não uma tabela.
Um índice único parcial garante no máximo um `ADMIN_PRINCIPAL`. O acesso integral do administrador é regra de
código, não linha de tabela, de modo que nenhuma configuração o reduz.

## D-07 · Permissões por perfil e módulo; ajuste individual adiado — 16/11/2026
A tabela `role_permissions` guarda uma linha por permissão concedida (perfil, módulo, ação). O administrador
personaliza por módulo. Regras fixas: módulos administrativos (Usuários, Auditoria, Configurações) nunca são
concedidos; o perfil Consulta nunca passa de "Ver". O ajuste por usuário individual, previsto no planejamento,
fica para a Fase 5 (revisão de permissões); o acesso por projeto (`ProjectMember`) entra na Fase 3.

## D-08 · Primeiro usuário pela tela de instalação — 16/11/2026
`/instalacao` só funciona sem nenhum usuário no banco e exige o código `SETUP_TOKEN` definido no servidor.
Uma trava no banco impede duas instalações simultâneas. Depois de usada, a rota responde 404.

## D-09 · Novos usuários com senha provisória — 16/11/2026
O administrador define uma senha provisória ao cadastrar; o sistema obriga a troca no primeiro acesso.
Motivo: o envio de e-mail (SMTP) ainda não está configurado. Quando estiver, pode-se trocar por convite por e-mail.

## D-10 · Limite de tentativas de login contado na auditoria — 16/11/2026
Cinco falhas por conta ou trinta por IP em 15 minutos bloqueiam novas tentativas. A contagem usa os registros
`LOGIN_FALHA` da auditoria, portanto sobrevive a reinícios e vale para várias instâncias.

## D-11 · Sessão de 8 horas — 16/11/2026
`SESSION_HOURS=8` por padrão, configurável. A sessão é validada no banco a cada requisição.

## D-12 · Acesso por projeto — 16/11/2026
Tabela `project_members`. O administrador principal vê todos os projetos; os demais, apenas aqueles em que são
responsáveis ou foram autorizados por ele. Um projeto sem acesso responde como inexistente, para não revelar que existe.
O mesmo filtro vale para etapas, disciplinas, tarefas e indicadores do dashboard.

## D-13 · Permissão verificada dentro dos serviços — 16/11/2026
Além da checagem nas telas (`requirePermission`), cada regra de negócio da Fase 3 chama `authorize(ator, módulo, ação)`.
Uma tela ou ação que esqueça a checagem não abre brecha.

## D-14 · Visibilidade de valores — 16/11/2026
A matriz aprovada diz que o Operacional vê propostas e contratos "sem valores". Regra adotada: o valor só é devolvido
pelo serviço a quem tem "Ver" em Financeiro ou pode criar/editar o próprio módulo.

## D-15 · Numeração automática — 16/11/2026
Propostas `PROP-AAAA-NNN`, contratos `CT-AAAA-NNN`, projetos `AAAA-NNN`, por sequência anual atômica (tabela `counters`).
A regra de numeração das pastas da PROJETARQ não foi informada; o formato do código do projeto pode ser ajustado
antes da integração com o OneDrive (Fase 4).

## D-16 · Fluxos por modalidade — 16/11/2026
O fluxo padrão de 14 etapas vem preenchido, com a pasta do OneDrive de cada etapa. PPCIP, SPDA, Laudos, Subestações,
Desmembramentos, Orçamentos, Execução de obras e Consultorias nascem com fluxo vazio, porque as etapas reais não foram
informadas. O administrador as define em Tramitação > Fluxos; enquanto isso, essas modalidades não aceitam projetos.
Nenhum prazo padrão foi inventado: as etapas nascem sem prazo até que ele seja definido.

## D-17 · Regras de tramitação — 16/11/2026
Avançar e mudar a situação da etapa exigem "Editar" em Tramitação; devolver etapa e marcar etapa como "não se aplica"
exigem "Aprovar" (por padrão, só o administrador). Tarefas em aberto vinculadas à etapa atual impedem o avanço.
Cancelar projeto exige "Excluir" em Projetos. O histórico (`stage_transitions`) é somente de inserção por gatilho.

## D-18 · Escopo adiado dentro da Fase 3 — 16/11/2026
Para manter a entrega testável, ficaram para fases seguintes itens do modelo de dados do planejamento:
itens e versões de proposta, aditivos de contrato (com o Financeiro, Fase 4), vários contatos por cliente
(hoje há um contato principal no cadastro), comentários/registro de atividades em tarefas e paginação das listas
(hoje limitadas a 300 registros com busca).

## Pendências conhecidas (não implementadas nesta fase)
- Política de segurança de conteúdo (CSP) completa para scripts — Fase 5.
- Arquivos Docker, Caddy e implantação na VPS — dependem do repositório GitHub e da VPS.
- Envio real de e-mail — depende das credenciais SMTP.
- Usuário de banco separado para a aplicação, sem permissão de DDL — Fase 6.
