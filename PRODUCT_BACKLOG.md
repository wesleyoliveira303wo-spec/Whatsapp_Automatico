# Product Backlog — Ideias e Oportunidades Futuras

Este documento guarda **oportunidades de produto e dívidas técnicas identificadas
mas deliberadamente NÃO implementadas**, para não perder a ideia nem contaminar o
escopo em execução.

Regra de uso: nada aqui está aprovado para implementação. Cada item registra
**onde a ideia surgiu**, **por que foi adiada** e **o que já se sabe** — para que,
quando (e se) entrar num roadmap oficial, não seja preciso redescobrir o contexto.

Para o que está de fato planejado e em execução, ver `ROADMAP.md` e
`FASE_1_ANALISE_ESTRATEGICA.md`. Para decisões arquiteturais já tomadas, ver
`DECISIONS.md`.

---

## 1. Radar Social — Atividade dos Contatos a partir dos Status

**Origem:** surgiu durante o HOTFIX de 2026-07-31 (ver `DECISIONS.md` ADR #93),
quando se descobriu que os Status (Stories) dos contatos chegavam ao Francis como
eventos reais do WhatsApp e estavam, indevidamente, criando conversas na Dashboard.
Ao corrigir o bug (passando a **ignorar** esses eventos por completo), o fundador
observou que o dado em si tem valor comercial — só está no lugar errado do produto.

**Status:** 🔵 **Registrada, não aprovada.** Adiada explicitamente por **não fazer
parte da Fase 1**. Nenhuma linha de código foi escrita para isso; o hotfix
descarta o evento na origem, como decidido.

**A ideia:** um módulo **independente do Inbox de Conversas** — Status não são
conversas e nunca devem voltar a se misturar com elas. Nomes cogitados:
_Atividade dos Contatos_, _Feed dos Clientes_, _Status dos Clientes_, _Radar Social_.

**Valor potencial:** transformar a atividade pública dos contatos em sinal
comercial, com a IA extraindo insights como:

- cliente anunciou uma promoção;
- mudança de horário de funcionamento;
- lançamento de produto;
- oportunidade de contato (gancho para abordagem);
- panorama de atividade recente da base de clientes.

**O que já se sabe tecnicamente** (levantado durante o hotfix, poupa
redescoberta):

- Um Status publicado chega em `messages.upsert` com
  `key.remoteJid === 'status@broadcast'`, o **autor real** em `key.participant`,
  e `broadcast: true` no nível da mensagem. Verificado no fonte de
  `@whiskeysockets/baileys@7.0.0-rc13` (`lib/Utils/decode-wa-message.js`).
- O Baileys expõe predicados oficiais para isso:
  `isJidStatusBroadcast`/`STORIES_JID`/`isJidBroadcast`
  (`lib/WABinary/jid-utils.js`).
- O conteúdo do Status vem no mesmo formato de qualquer mensagem
  (texto/imagem/vídeo), então a extração de mídia já existente (F1.1) seria
  reaproveitável.
- `ContextInfo` traz metadados ricos e específicos de Status já mapeados no
  proto: `statusSourceType` (IMAGE/VIDEO/GIF/AUDIO/TEXT), `statusAttributionType`,
  `forwardOrigin` (com valor `STATUS`), `statusAudienceMetadata`.

**Riscos/pontos a decidir antes de qualquer implementação:**

- **Volume e custo.** Num número movimentado, Status chegam continuamente. Passar
  cada um por IA teria custo real e recorrente — precisaria de amostragem,
  filtro por contato relevante, ou processamento em lote.
- **Privacidade e percepção.** Analisar automaticamente o Status de pessoas
  físicas é sensível. Precisa de decisão explícita de produto sobre escopo
  (só contatos que são clientes? opt-in por sessão?) antes de existir.
- **Persistência nova.** Exigiria modelo/tabela próprios — jamais reaproveitar
  `WhatsAppConversation`/`WhatsAppMessage`, cuja mistura foi exatamente o bug
  corrigido pela ADR #93.
- **Isolamento arquitetural.** O caminho natural seria um bounded context novo
  (ex.: `services/social`), consumindo um evento próprio do Provider — nunca
  reabrindo o filtro de `handleMessagesUpsert`, que hoje é a garantia de que
  Status não contaminam o atendimento.

---

## 2. Dívida técnica: `key.senderPn` não existe mais no Baileys v7

**Origem:** achado colateral do mesmo HOTFIX (ADR #93), ao ler o fonte do pacote
instalado.

**Status:** ✅ **Resolvida em 2026-08-07** (documentação corrigida em 2026-08-08 — este item
estava desatualizado, dizendo "sem urgência" quando já tinha sido corrigido). O fundador
reportou o sintoma exatamente como previsto abaixo (contato conhecido gerando conversa
nova) — `BaileysProvider.handleMessagesUpsert` corrigido para ler `message.key.remoteJidAlt`
em vez de `senderPn`. Conversas já fragmentadas do mesmo contato foram mescladas
manualmente no banco (operação pontual). Teste de regressão para "LID presente,
`remoteJidAlt` ausente" adicionado no Bloco F1.10 (2026-08-08) — é o padrão que causou
este bug duas vezes. Ver `CLAUDE.md` §18 ("Bug crítico pós-upgrade do Baileys v7").

**Descrição original do problema (registro histórico, mantido como estava):** desde a Milestone 6 (Bloco M6H-2b), `BaileysProvider` resolve o
número real por trás de um endereço `@lid` (formato de privacidade do WhatsApp,
comum em números novos) usando `message.key.senderPn`. Mas `grep -rn "senderPn"`
no pacote `@whiskeysockets/baileys@7.0.0-rc13` **não retorna nada** — a v7 passou
a expor esse dado como `key.remoteJidAlt` (visível em
`lib/Utils/decode-wa-message.js`). Logo, `message.key.senderPn || remoteJid`
hoje sempre cai no `remoteJid`, deixando o fix de LID **inerte** na versão atual.

**Por que não foi corrigido junto:** fora do escopo do hotfix (não tem relação
com o bug de Status) e sem impacto observado — a entrega real de mensagens, que
motivou o fix original, foi de fato resolvida pelo upgrade que corrigiu o erro
463, não por esse campo. Corrigir exige validar contra um contato real em `@lid`,
o que precisa de teste funcional com número novo.

**Quando isso vira problema (histórico — já resolvido, ver Status acima):** se voltarem a
aparecer conversas chaveadas por um JID `@lid` em vez do número real (sintoma: contato sem
nome/foto e mensagens que não entregam), o primeiro lugar a olhar não é mais `senderPn` (já
corrigido) — é conferir se o Baileys renomeou `remoteJidAlt` de novo, e revisitar o teste de
regressão do Bloco F1.10 (`BaileysProvider.test.ts`, caso "LID sem remoteJidAlt").

---

## 3. Disparos programados em GRUPOS de WhatsApp

**Registrado em:** 2026-09-05, pedido do fundador durante o desenho do painel
`/admin`. Anotado como oportunidade separada — **não** faz parte daquela spec.

### A ideia

Em Campanhas, listar os grupos de WhatsApp da sessão e permitir programar
disparos recorrentes neles: texto, imagem, arquivo ou áudio, uma ou mais vezes
por dia, em horários escolhidos, durante uma quantidade limitada de dias (para
a campanha não rodar para sempre). Serve para divulgação — postar criativos,
serviços e avisos em grupos de forma padronizada e automática.

Deixado explícito pelo fundador: **a IA não conversa nos grupos.** O grupo é
destino de publicação, não canal de atendimento.

### Por que NÃO é uma extensão pequena do motor de campanhas atual

Três descasamentos com o que existe hoje. Nenhum é impeditivo, mas juntos
significam desenho próprio, não um campo a mais:

1. **Grupos são filtrados na origem, de propósito.** `isIgnoredChatJid`
   (`BaileysProvider`) descarta todo `@g.us` desde a Milestone 3 — mensagem de
   grupo nunca vira `Conversation`, nunca chega na IA. Isso deve CONTINUAR
   valendo: o pedido é só de ENVIO. Ou seja, grupos precisam de um caminho de
   saída sem caminho de entrada — coisa que o produto nunca teve.

2. **O destinatário não é uma pessoa.** `CampaignRecipient` é chaveado por
   contato/telefone e carrega opt-out, supressão por conversa ativa e por
   recontato recente (Fase L, Blocos L2/L3). Nada disso existe para grupo: um
   grupo não dá opt-out, não tem conversa ativa com atendente, não tem
   identidade de pessoa. Forçar grupo dentro de `CampaignRecipient` sujaria as
   três regras de supressão que hoje protegem o disparo 1:1.

3. **A cadência é outra.** O motor atual envia UMA vez para cada destinatário e
   encerra (`computeSendDelayMs` espaça os N destinatários de uma campanha).
   Aqui é a MESMA mensagem para o MESMO grupo, repetida N vezes por dia
   durante D dias — mais perto de um agendamento recorrente do que de uma
   campanha. Provavelmente pede uma entidade própria e um job recorrente, não
   `Campaign`/`CampaignRecipient`.

### O risco, dito na cara

Disparo automático em grupo é o uso que o WhatsApp mais associa a spam — mais
sensível que o disparo 1:1 que a Fase L já assumiu (§7: Baileys é biblioteca
não-oficial, o número pode ser banido sem apelação). Publicar o mesmo criativo
em vários grupos, várias vezes ao dia, todos os dias, é exatamente o padrão que
dispara denúncia de membro e banimento.

Se for adiante, o desenho precisa incluir, no mínimo: teto de grupos por
disparo, intervalo mínimo entre publicações no MESMO grupo, e um disjuntor que
pare tudo ao primeiro sinal de bloqueio — os mesmos instintos que o motor 1:1
já tem, calibrados mais conservadoramente.

### O que já existe e seria reaproveitado

- Envio de mídia (`SessionManager.sendMediaMessage`, Fase 1/F1.3) — texto,
  imagem, áudio, documento já funcionam.
- Ritmo com jitter, janela de horário e disjuntor (`computeSendDelayMs`,
  `shouldTripCircuitBreaker`, Fase L/L4) — a lógica serve, a calibragem não.
- Listagem de grupos: **não existe**. Precisa de uma consulta nova ao Baileys
  (`groupFetchAllParticipating`), que é IQ query no mesmo socket das mensagens
  — vale o mesmo cuidado de timeout da ADR #78.

### Estado

**Entregue em 2026-09-11 — disparo ÚNICO (avulso), NÃO recorrente.** O
fundador pediu explicitamente a versão "disparo avulso" primeiro; a parte de
"programar" (repetir N vezes por dia, durante D dias) ficou de fora desta
rodada — ver a nota logo abaixo.

O que os três descasamentos acima geraram na prática, cada um resolvido como
previsto:

1. **Entrada continua filtrada.** `isIgnoredChatJid` não foi tocado — grupo
   segue sem criar `Conversation`/`Message`/interação de IA nenhuma. O disparo
   em grupos é PURO ENVIO, implementado como bounded context próprio
   (`services/groupBroadcasts`), nunca dentro de `services/conversations`.
2. **Entidade própria, não `Campaign`.** `GroupBroadcast`/`GroupBroadcastTarget`
   (migration `20260911120000_add_group_broadcasts`) — `status` reaproveita o
   enum `CampaignStatus` (mesmo ciclo de vida), mas as três regras de
   supressão de `CampaignRecipient` (opt-out/conversa ativa/recontato) NÃO se
   aplicam: um grupo só nasce `skipped` por `admin_only_group` (o número não é
   admin onde só admins publicam) ou `group_not_found` (saiu do grupo/id
   inválido) — decididos por uma consulta AO VIVO ao WhatsApp na criação
   (`GroupDirectory`/`groupFetchAllParticipating`, com timeout próprio, ADR
   #78), nunca confiando no que o cliente diz sobre o grupo.
3. **Cadência calibrada mais conservadora que o motor 1:1**
   (`groupBroadcastPacing.ts`): intervalo padrão 60s (piso 30s, nunca abaixo),
   teto de 30 grupos por disparo, disjuntor mais sensível (2 tentativas
   seguidas falhando já pausa, contra 5 do motor 1:1) — "ao primeiro sinal de
   falhas seguidas", como o risco descrito acima pedia.

**Fora desta entrega, registrado para quando/se o fundador quiser avançar:**
recorrência/agendamento (repetir a mesma mensagem N vezes por dia durante D
dias) — exigiria um job recorrente e uma decisão de produto sobre como editar/
cancelar uma série em andamento, nenhuma das duas resolvida aqui. Também fora:
áudio/documento como anexo de grupo (só imagem/vídeo, mesmo escopo que o
fundador pediu — "mensagem, imagem, vídeo").
