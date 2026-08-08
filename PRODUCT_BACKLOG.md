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
