# Sistema Financeiro — API

Backend do sistema financeiro pessoal (front em `../SISTEMA-FINANCEIRO-FRONT`).
Express 5, Prisma 7, PostgreSQL, Zod 4, Swagger gerado a partir dos schemas.

## Arrancar

```bash
cp .env.example .env        # preencher DATABASE_URL e JWT_SECRET (openssl rand -base64 48)
yarn install
yarn migrate:deploy         # cria as tabelas
yarn seed                   # dados de referência + super administrador + demo com 6 meses de dados
yarn dev                    # http://localhost:4000 — docs em /api-docs
```

Com Docker: `docker compose up --build` (aplica as migrações ao arrancar).

| Script | O que faz |
| --- | --- |
| `yarn dev` | Servidor com recarregamento |
| `yarn test` | Testes de integração (base `financeiro_test`, ou `TEST_DATABASE_URL`) |
| `yarn type-check` / `yarn build` | Verificação de tipos / build para `dist/` |
| `yarn migrate` | Nova migração a partir do `schema.prisma` |
| `yarn emails:run [AAAA-MM-DD]` | Corre já a tarefa diária de emails (alertas, resumo semanal, relatório mensal) |

Para os testes: `createdb financeiro_test` e aplicar as migrações a essa base
(`DATABASE_URL=postgresql://<utilizador>@localhost:5432/financeiro_test yarn migrate:deploy`).
Antes de cada teste a base é limpa e os dados de referência são semeados de novo.

### Contas de desenvolvimento (criadas pelo `yarn seed`)

| Conta | Credenciais | Perfil |
| --- | --- | --- |
| Super administrador | `admin@financas.local` / `admin12345` (env `ADMIN_*`) | `SUPER_ADMIN` |
| Demonstração | `demo@financas.local` / `demo12345` | `USER` |

O `yarn seed` pode repetir-se: só cria o que falta (nunca sobrescreve parâmetros, menus ou
permissões alterados no painel) e não muda a palavra-passe de um administrador que já exista.

### Variáveis de ambiente

| Variável | Descrição |
| --- | --- |
| `DATABASE_URL` | Ligação ao PostgreSQL |
| `JWT_SECRET` | Obrigatório, mínimo 32 caracteres |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Super administrador criado pelo seed (dev: `Administrador`, `admin@financas.local`, `admin12345`) |
| `CORS_ORIGINS`, `APP_TZ`, `SMTP_*`, `MAIL_FROM` | Como antes |
| `ANTHROPIC_API_KEY` | Opcional. Liga o assistente com IA (Claude); sem ela o assistente funciona em modo offline |

A duração da sessão deixou de ser `JWT_EXPIRES_IN`: é o parâmetro `auth.sessionDays`.

## Organização

```
src/
  app.ts, server.ts, routes.ts
  config/env.ts            # ambiente validado no arranque
  shared/                  # prisma, erros (problem+json), auth, docs, mail, dinheiro e datas
  modules/<domínio>/       # routes · controller · service · schemas · types · docs
```

Módulos: `auth`, `accounts`, `categories`, `transactions`, `dashboard`, `budgets`, `goals`,
`investments`, `reports`, `alerts` (com emails), `settings` (inclui `/export` e `/demo/reset`),
`access` (menu), `family`, `help` (manual e FAQ), `assistant`, e de administração `admin-users`, `profiles`, `functionalities` (menus),
`system-settings` (+ `/config/public`), `currencies` e `audit`.

`src/seed/` tem os dados de referência (moedas, menus, perfis, permissões) e os utilizadores do seed;
os parâmetros do sistema estão definidos em `src/shared/settings/definitions.ts`.

## Perfis e permissões

- **Perfis** (`profiles`): `SUPER_ADMIN` (acesso total, não configurável), `ADMIN` (utilizadores,
  manual e auditoria; vê os perfis mas não os altera; sem parâmetros nem menus), `USER` (perfil por
  omissão no registo; todos os módulos pessoais) e `DEPENDENT` (contas criadas por um responsável;
  sem investimentos nem família). Os quatro são de sistema e não se apagam; podem criar-se outros.
- **Funcionalidades** (`functionalities`) são ao mesmo tempo o menu e a unidade de permissão.
  Cada uma tem `apiPaths` (padrões como `/transactions/**`; `*` = um segmento, `**` = o resto).
  Secções (`MAIN`, `PLANNING`, `ANALYSIS`, `SYSTEM`, `ADMINISTRATION`) não têm `path`.
- **Permissões** (`profile_functionalities`): acções `VIEW | CREATE | EDIT | DELETE | EXPORT | IMPORT`
  por perfil e funcionalidade. As entradas herdam as acções da secção-pai a que o perfil esteja ligado.
- O middleware `authorize` deriva a acção do pedido (GET → VIEW, ou EXPORT em `/export`; POST → CREATE,
  ou VIEW em `/search` e `/chat`, IMPORT em `/import`, EDIT em `/password` e `/read`; PUT/PATCH → EDIT;
  DELETE → DELETE), encontra a funcionalidade pelo padrão mais específico e decide:
  sem funcionalidade → permitido; super administrador → permitido; funcionalidade inactiva → 403;
  VIEW → permitido, excepto com `protectReads` (todas as `/admin/**`), que exige ligação ao perfil;
  outras acções → têm de estar na lista. O 403 diz, por exemplo, `O seu perfil não pode criar em "Transações".`
- Índice em memória (funcionalidades + permissões), invalidado em cada alteração pelo painel
  e com TTL de 30 s para várias instâncias.
- `GET /access/menu` devolve a árvore que o utilizador pode ver, com as acções de cada entrada.
- Contas desactivadas não iniciam sessão e perdem as sessões abertas. Não se pode desactivar a
  própria conta nem ficar sem super administradores activos; só um super administrador mexe noutro
  ou atribui esse perfil.

## Paginação

Todas as listas (`/accounts`, `/categories`, `/transactions`, `/goals`, `/investments` e as de
administração) aceitam `page` (a começar em 0), `size` (por omissão `pagination.defaultSize`, limitado a
`pagination.maxSize`), `sort=campo,asc|desc` (campos permitidos por rota; outro dá 422) e `search`.
Respondem `{ content, page, size, totalItems, totalPages, hasNext, hasPrevious }`.
`/transactions` junta `totals` calculados sobre todo o filtro (não só a página); `q` continua a ser
aceite como sinónimo de `search`. Os ecrãs agregados (dashboard, orçamentos, relatórios) não mudaram.

## Parâmetros do sistema e moedas

- `system_settings` (chave, valor JSON, tipo `STRING | NUMBER | BOOLEAN | SELECT | TEXT`, grupo,
  opções, regras `constraints`, `public`), com cache em memória invalidada na escrita.
  O código lê-os com `appSettings.get("chave")`; se faltar uma linha, usa o valor de `definitions.ts`.
- Grupos: `app`, `auth` (registo aberto, tamanho mínimo da palavra-passe, dias de sessão), `locale`
  (moeda por omissão), `pagination`, `alerts` (valores iniciais das definições de alertas), `emails`
  (liga/desliga os emails diários), `family`, `assistant`, `help`.
- `GET /config/public` (sem sessão): parâmetros públicos e moedas activas.
- `GET /admin/settings` (agrupado) e `PUT /admin/settings/:key { value }` (validado pelo tipo e regras).
- Moedas em `currencies` (substituiu o enum; `users.currency` é FK). Não se apaga uma moeda em uso nem a
  moeda por omissão — desactiva-se. As definições pessoais só aceitam moedas activas (ou a que já usa).

## Família

Um responsável cria contas de dependentes (`POST /family/dependents`, perfil `family.dependentProfile`)
ou convida contas existentes (`POST /family/invitations`, a pessoa aceita ou recusa). Cada ligação tem
acesso `VIEW` ou `MANAGE`. Com o cabeçalho `X-Acting-As: <id do dependente>`, os pedidos às rotas
pessoais passam a usar os dados do dependente (com `VIEW`, as escritas dão 403); as permissões e o menu
continuam a ser os do responsável. `/admin`, `/family`, `/auth` e `/access` ignoram o cabeçalho.

## Ajuda: manual e FAQ

- O **manual de utilizador** está em `content/manual/*.md` (um artigo por ficheiro, com front-matter
  `slug`, `title`, `summary`, `category`, `order`) e as **perguntas frequentes** em `content/faq.md`
  (secções `## Pergunta?` com `<!-- key: …; category: … -->`). O `yarn seed` (e o arranque de cada teste)
  cria na base os artigos/perguntas que faltam, identificados por `seed_key`: **nunca sobrescreve** o que foi
  editado no painel. Para esconder um artigo de origem, despublique-o (se o apagar, o próximo seed recria-o).
  Para actualizar um texto de origem numa base existente, edite-o no painel (ou apague-o e corra o seed).
- `GET /help/articles` (índice publicado), `GET /help/articles/:slug`, `GET /help/faqs` (vazio com `help.showFaq`
  desligado) e `GET /help/search?q=&limit=` (por palavras, sem acentos, com radical simples; título/pergunta
  pesam mais do que o corpo; devolve `{query, items:[{kind, id, slug?, title, category, snippet, href, score}]}`).
- Administração (`ADMIN_HELP`): CRUD paginado em `/admin/help/articles` e `/admin/help/faqs` (`search`,
  filtros `published` e `category`), `PATCH /:id/published` e `PUT /order`.

## Assistente

`POST /assistant/chat { conversationId?, message }` responde em **Server-Sent Events**
(`meta` → `delta`… / `tool`… → `done` ou `error`). As conversas ficam em `assistant_conversations` /
`assistant_messages` (`GET/DELETE /assistant/conversations[/:id]`).

- **Configurar a IA:** pôr `ANTHROPIC_API_KEY=<chave>` no `.env` e reiniciar. A chave só existe no backend.
- **Parâmetros** (Administração › Parâmetros, grupo Assistente): `assistant.enabled` (desligado → 403),
  `assistant.model` (por omissão `claude-opus-5-5`), `assistant.effort` (`low`/`medium`/`high`, enviado como
  `output_config.effort`), `assistant.dailyLimit` (mensagens por utilizador efectivo por dia, 429 acima; 0 = sem limite)
  e `assistant.welcome` (texto de boas-vindas, público).
- **Modo offline** (sem chave): mesmo protocolo com `mode: "offline"`; responde com a melhor FAQ ou a secção
  mais relevante do manual e ligações "Veja também". Não lê dados do utilizador.
- **Modo IA:** ciclo manual com streaming do SDK `@anthropic-ai/sdk` (`messages.stream` + `finalMessage`), ferramentas
  só de leitura que reutilizam os serviços (`get_accounts`, `get_month_summary`, `list_transactions`, `get_budgets`,
  `get_goals`, `get_investments`, `get_alerts`, `search_help`), entradas validadas com zod. O prompt estável (instruções
  + manual + FAQ publicados) vai em cache (`cache_control`); a data, o nome e a moeda vão num bloco seguinte, fora da cache.
- Respeita o `X-Acting-As`: o assistente só lê os dados do utilizador efectivo, e as conversas pertencem ao par
  (utilizador efectivo, quem iniciou sessão). O cliente que fecha a ligação cancela o pedido ao modelo.
- Atrás de proxies, as respostas levam `Cache-Control: no-cache, no-transform` e `X-Accel-Buffering: no`.

## Auditoria

O middleware `audit` grava em `audit_logs` as escritas, exportações, logins (com e sem sucesso) e
acessos recusados (403), com a funcionalidade, quem agia por quem, IP, duração e o corpo do pedido com
palavras-passe e tokens mascarados. Consulta em `GET /admin/audit` (filtros `action`, `actorId`,
`from`, `to`, `search`).

## Regras do contrato

- O contrato é o dos mocks do front (`src/mocks/*`): respostas JSON directas e erros em
  `application/problem+json`, com `errors: [{ field, message }]` nos 422.
- Dinheiro é `Decimal(15,2)` na base e string `"1250.00"` no JSON; a entrada aceita vírgula.
- Saldos, valor guardado nas metas, valor actual dos investimentos e alertas são sempre
  calculados, nunca guardados.
- Datas de calendário em `@db.Date`; "hoje" e "mês corrente" seguem `APP_TZ`.
- Todas as rotas (excepto registo, login, health e `/config/public`) exigem `Authorization: Bearer <token>`,
  e cada utilizador só vê os seus dados (ou os de um dependente, com `X-Acting-As`).
- Sem `SMTP_HOST`, os emails são escritos no log em vez de enviados.
