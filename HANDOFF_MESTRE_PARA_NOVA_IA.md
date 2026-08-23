# PROMPT DE HANDOFF — PROJETO FRANCIS / WHATSAPP_AUTOMATICO

Você está assumindo o projeto **Francis**, uma plataforma de atendimento e automação de WhatsApp com IA, atualmente em fase de validação com clientes reais (pré-produto, não SaaS ainda). Este documento foi gerado por auditoria direta do código, schema, migrations, testes, git e dados reais do banco — não por leitura cega de documentação. Onde a documentação e o código divergiam, o código venceu. Leia até o fim antes de agir.

---

## 1. CONTEXTO GERAL

Francis é uma ferramenta que conecta a um número de WhatsApp real (via Baileys, biblioteca não-oficial que emula o WhatsApp Web) e faz uma IA atender clientes automaticamente: responde dúvidas, qualifica o lead, classifica o estágio da negociação, e escala para um humano quando necessário. Além do atendimento reativo, tem um motor de campanhas para reengajar contatos antigos e abordar contatos frios de forma controlada.

O produto tem identidade de marca própria ("Francis" — nome escolhido após checagem de colisão com outras marcas), mas ainda está em fase de validação: hoje roda **localmente**, na máquina do fundador, atendendo 2 números de WhatsApp reais (2 tenants no banco).

## 2. OBJETIVO DO PROJETO

Resolver o problema de pequenas/médias empresas que atendem clientes pelo WhatsApp manualmente: leads sem resposta, atendimento lento fora do horário, e nenhuma estrutura de funil/CRM em cima da conversa. O usuário principal é o dono/operador de um pequeno negócio (ex.: desenvolvedor de sites, loja) que quer que a IA responda primeiro e ele intervenha só quando necessário.

## 3. ARQUITETURA ATUAL

**Monorepo** (npm workspaces): `apps/api`, `apps/dashboard`, mais um domínio legado congelado em `src/` (raiz) do Milestone 001 — **não é código ativo**, ignore-o a menos que investigado explicitamente.

- **Backend (`apps/api`)**: Node.js + Express + TypeScript, Clean Architecture por bounded context (`services/<contexto>/{domain,application,infrastructure,presentation}`). Contextos ativos: `whatsapp`, `conversations`, `ai`, `contacts`, `campaigns`, `tags`, `quickReplies`, `analytics`, `auth`.
- **Worker de IA (`apps/api/src/worker.ts`)**: processo Node separado, consome a fila `ai-reply` (BullMQ/Redis). Nunca fala com Baileys diretamente (ADR #54) — só o processo `apps/api` tem os sockets do WhatsApp.
- **Frontend (`apps/dashboard`)**: Next.js 13 (Pages Router), atua como **BFF** — o browser nunca fala direto com a API; toda chamada passa por `pages/api/*` no próprio Next, que injeta a credencial (cookie httpOnly) e faz proxy pra API real.
- **Banco**: PostgreSQL 15 via Prisma ORM. 32 migrations aplicadas.
- **Fila/cache**: Redis via BullMQ. Duas filas principais: `ai-reply` (resposta da IA, rápida, alguém esperando) e `campaign-send` (disparo de campanha, lenta, ninguém esperando — filas deliberadamente separadas, perfis de tráfego opostos).
- **Docker**: `docker-compose.yml` (dev, Postgres+Redis+api+worker+dashboard) e `docker-compose.prod.yml` (VPS, hardened: Postgres/Redis sem porta pública, `api`/`dashboard` só em loopback atrás de Nginx, `restart: unless-stopped`). Dockerfiles existem para `apps/api` e `apps/dashboard`. **Isto nunca foi testado numa VPS de verdade nesta auditoria** — só confirmado que os arquivos existem e são coerentes.
- **WhatsApp**: `@whiskeysockets/baileys@7.0.0-rc13` — biblioteca NÃO OFICIAL (engenharia reversa do protocolo do WhatsApp Web). Isso é uma decisão de risco CONSCIENTE e já discutida com o fundador (não é ignorância): o número pode ser banido pela Meta, sem apelação, mesmo com uso comedido.
- **IA**: dois providers implementados (`ClaudeAiProvider` via SDK oficial da Anthropic; `GeminiAiProvider` via `fetch` cru, sem SDK). O provider ativo agora é **Gemini** (`AI_PROVIDER=gemini` no `.env` local).

## 4. O QUE JÁ ESTÁ IMPLEMENTADO

Confirmado por leitura de código + rotas + testes passando + dados reais no banco.

**WhatsApp / Sessões**
- Conectar via QR Code, múltiplas sessões por tenant, reconexão automática, restauração de sessões ao reiniciar a API.
- Recebimento e envio de texto e mídia (imagem/áudio/vídeo/documento), com download sob demanda (nunca persiste mídia recebida em disco) e envio síncrono de mídia pelo operador/campanha.
- Filtros na origem: grupos (`@g.us`), canais (`@newsletter`), broadcasts/Status (`@broadcast`) e respostas/reações a Status nunca viram conversa.
- Botão liga/desliga a IA por sessão (não afeta a conexão nem o recebimento).

**IA / Atendimento**
- 4 versões de prompt registradas em código (`v1`–`v4`), cada uma imutável — trocar é só a env var `AI_PROMPT_VERSION` + restart do worker, sem deploy de código.
- Base de Conhecimento por sessão (texto livre, "Cérebro da IA"), com modo Assistente Guiado (quiz) e botão de cadastrar FAQ manual.
- Agrupamento de mensagens em rajada (várias mensagens seguidas do cliente viram uma resposta só).
- Classificação automática de estágio do funil (marcador interno no texto da resposta, removido antes de chegar ao cliente).
- Escalonamento automático (a IA decide) + manual (operador assume) — a IA NÃO sai do circuito automaticamente ao escalar; só uma ação humana explícita a tira.
- Rate limit de IA por conversa/sessão, concorrência controlada (mutex por conversa, paralelo entre conversas).
- Interpretação de imagem/áudio pela IA (multimodal, só quando o provider é Gemini).
- Custo de IA rastreado por interação (`AiInteraction.costUsd`).

**Conversas**
- Inbox estilo WhatsApp Web/Telegram, tempo real via polling.
- Pipeline Kanban (5 estágios), drag-and-drop, IA reclassifica só pra frente (nunca regride um card corrigido manualmente).
- Tags, resumo de conversa sob demanda pela IA, indicador de não lidas.
- Marcar conversa como "não é cliente" (exclui do Pipeline/funil comercial sem apagar histórico).

**Contatos**
- `WhatsAppContact` — identidade DURÁVEL por telefone (E.164, normalizado, com regra do 9º dígito), por TENANT (não por sessão — cruza WhatsApps diferentes da mesma empresa).
- Backfill automático a partir de conversas existentes; vínculo automático (nunca sobrescreve nome já salvo).
- Importação por CSV (permanente, cria `WhatsAppContact` de verdade) — rota `POST /contacts/import`.
- Opt-out por palavra-chave automática + manual, com log de consentimento append-only.
- Tela "Contatos" no rail principal, com estatísticas, seleção em lote, "abrir conversa".

**Campanhas**
- `Campaign`/`CampaignRecipient`, máquina de estados completa (draft→running→paused/completed/cancelled), supressão automática (opt-out, conversa ativa com humano NA MESMA SESSÃO, contatado recentemente por outra campanha na mesma sessão).
- Motor de envio real: fila dedicada, ritmo configurável (intervalo+jitter+janela de horário+teto diário), pausar/retomar/cancelar/reabrir, disjuntor de segurança automático por taxa de falha.
- Dois caminhos de envio: reengajamento (contato que já tem conversa) e primeiro contato frio (cria a conversa, `stage: contacted`) — risco aceito conscientemente pelo fundador.
- Mídia anexada ao disparo (imagem/vídeo/documento), binário em Postgres, só `draft` pode anexar/trocar/remover.
- IA reconhece que a conversa nasceu de campanha e marca resposta automaticamente.
- Métricas: taxa de resposta, tempo até 1ª resposta, funil de estágio das conversas vinculadas, custo de IA, taxa de conversão.

**Outros**
- RBAC completo (5 papéis, permissões por rota), auditoria append-only, multiusuário por tenant.
- Respostas rápidas (templates) por sessão.
- Analytics: uso de IA, fluxo de mensagens, funil de Pipeline, taxa de escalonamento, estabilidade de sessão, analytics de campanha.
- `/health` (liveness) e `/health/ready` (Postgres+Redis+profundidade de fila).

## 5. CAMPANHAS E DISPAROS — ESTADO REAL

| Item | Estado |
|---|---|
| Criar campanha (contatos salvos, CSV, colar números) | 🟢 Implementado e testado |
| Supressão automática (opt-out/conversa ativa/recontato) | 🟢 Implementado, escopado por sessão, testado contra Postgres real |
| Envio de texto | 🟢 Implementado, **validado com envio real** (múltiplos testes) |
| Envio de mídia (imagem/vídeo/documento) | 🟢 Implementado, **validado com 1 envio real de imagem** — teve um bug de prévia na Dashboard (corrigido, não revalidado após a correção) |
| Reengajamento (contato com conversa existente) | 🟢 Implementado e validado com envio real |
| Primeiro contato frio (sem conversa prévia) | 🟢 Implementado, validado com 1 envio real |
| Pausar/retomar/cancelar/reabrir | 🟢 Implementado, testado (não validado extensivamente em uso real) |
| Ritmo (intervalo+jitter+janela de horário+teto diário) | 🟢 Implementado, **nunca testado com volume real** (todas as campanhas reais tiveram 1-2 destinatários) |
| Disjuntor de segurança (taxa de falha) | 🟢 Implementado e testado, **nunca disparou em uso real** |
| Métricas de campanha | 🟢 Implementado, testado, com pouquíssimo dado real para validar visualmente |
| Agendamento (`SCHEDULED`) | 🔴 Campo existe no schema, **zero código lê/usa isso** — não implementado |
| Segmentação por tag/estágio na criação | 🔴 Não existe |
| Múltiplas sessões por campanha | 🔴 Não existe (uma campanha é sempre de UMA sessão) |
| Sequências de follow-up automáticas | 🔴 Não existe |
| Teto diário por sessão (entre campanhas diferentes) | 🔴 Hoje é só por campanha individual |

**Risco real e não resolvido:** o teto grátis do Gemini não sustenta uma campanha com resposta concentrada — se muitos leads responderem ao mesmo tempo, a IA pode esgotar a cota do dia. Rate limit por conversa/sessão dá uma rede de segurança parcial, mas não é a solução completa.

## 6. CONTATOS — ESTADO REAL

- `WhatsAppContact` é o model real e ativo (não confundir com `Contact`, que é o model LEGADO/congelado do Milestone 001 — schema tem os dois, só o primeiro é usado por código ativo).
- Contato criado automaticamente quando alguém escreve pra um WhatsApp conectado (nasce sem nome). Nome só existe se: (a) importado por planilha, (b) editado manualmente, (c) capturado do `pushName` do WhatsApp em certos casos.
- Importação por planilha **é permanente** e pertence à aba **Contatos** (`POST /api/tenants/:id/contacts/import`) — cria `WhatsAppContact` de verdade.
- **A separação Contatos × Campanhas é REAL e confirmada no código**, não é só intenção documentada: a aba Contatos é gerenciamento puro de identidade/CRM; a aba Campanhas é a ferramenta de disparo. Números soltos digitados/colados numa campanha (sem Contato correspondente) **nunca criam um `WhatsAppContact`** — existem só como `phoneE164`/`name` dentro daquele `CampaignRecipient`, isolados daquela campanha (confirmado na docstring do `CampaignService.createCampaign`: "isto nunca cria um WhatsAppContact — a planilha alimenta só esta campanha").
- Opt-out é por PESSOA (tenant-wide), não por sessão — não afeta atendimento normal, só bloqueia novo disparo de campanha.

## 7. CONVERSAS E IA

Fluxo real, ponta a ponta:

1. Mensagem chega no WhatsApp → Baileys emite evento → filtro de origem (descarta grupo/canal/status) → `MessageIngestionService` grava a `WhatsAppMessage`, vincula/cria `WhatsAppContact`, checa opt-out por palavra-chave.
2. Se a sessão tem IA ligada e a conversa não está com um humano assumido, agenda um job na fila `ai-reply` com um delay curto (deixa a rajada de mensagens se formar).
3. `AiReplyJobProcessor` relê o histórico mais recente ANTES de gerar (só o job da ÚLTIMA mensagem da rajada de fato responde).
4. `PromptBuilder` monta o prompt: base (`PromptVersion` ativa) + Cérebro da IA da sessão (texto livre) + aviso de horário + contexto de campanha (se aplicável) + **diretiva final** (só existe em `v4`, é a ÚLTIMA coisa que o modelo lê — sobrepõe instruções de conduta que vieram do Cérebro).
5. Provider (Gemini hoje) gera a resposta. Sistema extrai os marcadores internos (estágio do funil + motivo de escalonamento), remove antes de mandar ao cliente, envia (dividido em até 3 balões, se o prompt instruir quebra de linha).
6. Atualiza `stage` da conversa (a IA nunca regride um estágio corrigido manualmente por humano — só avança).
7. Se marcou escalonamento, sinaliza `escalatedAt` (não muda `status` sozinha — só "Assumir conversa" muda o dono).

## 8. DECISÕES ARQUITETURAIS IMPORTANTES

Todas confirmadas no código atual — não quebre sem entender o motivo:

- **Cada WhatsApp é uma empresa independente.** Supressão de campanha, navegação, Cérebro da IA — tudo escopado por sessão, não tenant inteiro (exceto opt-out, que é da pessoa).
- **Prompt versionado em código, imutável.** `v1`–`v4` nunca são editados depois de criados; trocar comportamento é criar uma versão nova + mudar a env var.
- **`closingDirective` (só em `v4`) é sempre a ÚLTIMA coisa no prompt.** Existe porque o Cérebro da IA (texto do cliente, pode ser maior que o prompt base) derrotava instruções de formato/conduta do prompt de sistema. Nunca mova essa diretiva para outra posição.
- **Nunca inventar preço/prazo/prova; nunca prometer aprovação; nunca incentivar fraude.** Regra absoluta em todas as versões de prompt, nunca condicional.
- **Opt-out nunca afeta atendimento normal** — só bloqueia novo disparo de CAMPANHA.
- **Números soltos de campanha nunca viram Contato automaticamente.**
- **Identidade de contato ≠ endereço de envio.** O telefone canônico normalizado (E.164) é pra IDENTIDADE; o envio de fato usa o `contactJid` real da conversa (que pode ter formato diferente, ex. `@lid`).
- **Mídia enviada por NÓS (operador/campanha) nunca tem referência real ao CDN do WhatsApp** — por isso precisa de um cache auxiliar (`AgentMediaCache`, TTL 1h) pra reexibir na Dashboard. Se esse cache não for populado, a prévia quebra (bug real, corrigido nesta sessão — ver seção 11).
- **`worker.ts` nunca fala com Baileys/sockets diretamente** (ADR #54) — toda comunicação entre worker e api passa por filas BullMQ.
- **O binário de mídia de campanha nunca pode entrar num `select` default do Prisma** — vazaria em toda resposta JSON de lista/detalhe de campanha. Há um `CAMPAIGN_SELECT` explícito pra isso.
- **IA nunca regride o estágio do Pipeline** depois de corrigido manualmente — só avança.

## 9. ESTADO DO AMBIENTE

Como rodar hoje (localmente, é assim que roda agora):

```bash
docker compose up -d postgres redis
cd apps/api && npx prisma migrate dev && npx prisma generate
npm run dev   # na raiz, sobe api+worker+dashboard concorrentemente
```

- `apps/api` escuta em `:4000`, `apps/dashboard` em `:3000`.
- `.env` (raiz, git-ignored) precisa de: credenciais Postgres/Redis, `WHATSAPP_CREDENTIALS_MASTER_KEY`, `API_KEY_PEPPER`, chaves de sessão do Dashboard, `AI_PROVIDER` + credencial do provider escolhido, e **`AI_PROMPT_VERSION`** (sem essa variável, cai em `v1` — só anti-alucinação genérica, SEM a postura de vendas do `v4`).
- `.env.example` existe e está atualizado, mas **não define `AI_PROMPT_VERSION`** — se for usado como template puro, herda o default antigo do código.
- Docker de produção (`docker-compose.prod.yml`) existe mas **nunca foi testado numa VPS real** dentro do que esta auditoria conseguiu confirmar.
- Não há CI configurado rodando testes automaticamente em push (verificar `.github/workflows` se existir — não confirmado nesta auditoria).

## 10. TESTES E QUALIDADE

- **236 suítes / 2.266 testes, 100% verdes**, confirmado rodando agora (`npx jest` na raiz).
- Maioria unitária com Fakes em memória; parte real de infraestrutura tem testes de INTEGRAÇÃO contra Postgres real (ex.: elegibilidade de campanha, identidade de contato, mídia de campanha) — esses são pulados silenciosamente (não falham) se o Postgres não estiver de pé, então "verde" nem sempre prova que rodaram de verdade — sempre confirmar ausência do aviso "Postgres indisponível — pulando".
- `tsc --noEmit` e `next build` confirmados limpos nos dois pacotes na última rodada de trabalho.
- Comando: `npx jest` (raiz) roda os três projetos (`api`, `dashboard`, `dashboard-jsdom`).

## 11. PROBLEMAS CONHECIDOS

- **`AgentMediaCache` (prévia de mídia) é efêmero de propósito** — se a API reiniciar ou passar 1h, a prévia de imagem/vídeo enviado por nós (operador ou campanha) some da Dashboard, mesmo a mensagem já tendo sido entregue de verdade no WhatsApp. Comportamento aceito, não é bug.
- **`AI_PROMPT_VERSION`/`AI_PROVIDER` não versionados** — dependem de configuração manual do `.env` de cada ambiente; um deploy novo sem essas variáveis volta pro comportamento genérico antigo (`v1`).
- **Dependência de cota do provider de IA gratuito** (Gemini free tier) não sustenta pico de resposta concentrado — pode travar respostas durante uma campanha bem-sucedida.
- **Baileys é não-oficial** — risco de banimento sempre presente, sem mitigação técnica real além de ritmo conservador.
- **Trabalho extenso não commitado** (ver seção 13) — risco real de perda se a working tree for descartada/resetada sem cuidado.
- **`.env.example` desatualizado** em relação ao que o `.env` real local usa (falta `AI_PROMPT_VERSION`).

## 12. O QUE NÃO DEVE SER FEITO AGORA

- Reescrever a arquitetura de bounded contexts — está consistente e funcionando.
- Migrar Baileys pra WhatsApp Cloud API oficial sem uma decisão de negócio explícita do fundador (é uma mudança de modelo de custo/risco, não técnica).
- Implementar agendamento de campanha (`SCHEDULED`), segmentação avançada, ou sequências de follow-up — não são a prioridade agora, e o `MVP` deliberadamente adiou isso (ver `FASE_L_MOTOR_DE_LEADS.md` §14, "Fica para depois").
- Migrar de Postgres pra storage de arquivo pra mídia — decisão consciente de manter tudo em Postgres.
- Grandes refatorações de schema — o legado congelado (`Contact`/`Conversation`/`Message`) não deve ser tocado nem removido sem entender por que ele foi "congelado" e não apagado (limitação de ambiente de sessões anteriores, não decisão de produto).

## 13. PRÓXIMO PASSO RECOMENDADO

**Se eu fosse o responsável técnico pelo Francis hoje, o próximo passo seria:**

1. **Commitar o trabalho pendente AGORA, antes de qualquer coisa nova.** 107 arquivos modificados/novos, quase 8 mil linhas de diff, representando toda a Fase L5–L8 e as correções de prompt/mídia, estão só na working tree local, em nenhum branch remoto. Isso é o risco mais alto e mais barato de resolver de todo este documento — não é trabalho novo, é só não perder o que já foi feito. Separar em commits coerentes por bloco (L5, L6-fix, L7 se ainda não commitado, L8, prompt v3/v4, bugfix de mídia) facilita revisão e rollback seletivo se precisar.
2. **Validar campanha com volume real pequeno mas de verdade** (10-30 contatos reais, não 1-2) — todo o motor de ritmo/disjuntor/teto diário está testado só em unidade e integração, nunca em condição real de volume. É o maior gap entre "implementado" e "provado".
3. **Fixar `AI_PROMPT_VERSION`/`AI_PROVIDER` como parte formal do processo de deploy** (documentar no `.env.example` com o valor recomendado, não deixar como "descoberta" de quem sobe um ambiente novo).

Não recomendo abrir uma fase nova (L9, agendamento, segmentação) antes desses três passos — o risco maior agora é operacional (perda de trabalho, validação insuficiente), não de funcionalidade faltando.

## 14. INSTRUÇÕES PARA A NOVA IA

Você deve:

1. Não assumir que documentação (`CLAUDE.md`, `ROADMAP.md`, ADRs) é verdade sem verificar contra o código quando tiver acesso a ele — este próprio handoff foi construído assim, e a documentação já divergiu do código real várias vezes ao longo deste projeto.
2. Não fazer refatorações gigantes sem necessidade.
3. Não misturar novas funcionalidades com correções no mesmo commit — separe.
4. Preservar as decisões arquiteturais da seção 8 — todas foram tomadas com contexto real (bugs reais, pedidos explícitos do fundador), não por preferência estética.
5. Priorizar validação real (uso de verdade) antes de expandir escopo — o padrão deste projeto até aqui foi sempre "implementar → testar em unidade → validar com o fundador usando de verdade → só então seguir".
6. Antes de implementar algo grande, analisar o impacto no que já existe — o projeto tem histórico de bugs causados por mudanças que pareciam isoladas mas não eram (ex.: escopo de elegibilidade de campanha, cache de mídia).
7. Responder em português.
8. Ser objetiva — evitar relatórios gigantes quando uma resposta curta resolver.
9. **Antes de qualquer trabalho novo, resolver a pendência de commit** (seção 13, item 1) — não construa em cima de uma working tree não versionada sem avisar o usuário do risco.
