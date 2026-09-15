# Editar campanhas depois de criadas (disparos para grupos e para contatos)

**Data:** 2026-09-15
**Status:** aprovado pelo fundador (design validado em conversa antes desta escrita)

## 1. Problema

Hoje uma campanha é imutável depois de criada. Os dois serviços
(`GroupBroadcastService` e `CampaignService`) expõem apenas criar, iniciar,
pausar, cancelar, excluir e anexar mídia — **nenhum método de edição**. Para
trocar uma vírgula do texto ou tirar um grupo da lista, o operador precisa
excluir a campanha e recriar do zero, perdendo o histórico de tudo que já
tinha sido publicado.

O fundador opera disparos reais em produção e está prestes a operar disparos
de clientes pagantes. Recriar campanha a cada ajuste é inviável nesse cenário:
perde histórico, perde o relatório que ele prometeu entregar ao cliente, e
multiplica a chance de erro de configuração.

## 2. Decisões tomadas

Três decisões do fundador, tomadas antes desta spec:

1. **Escopo:** os dois tipos de campanha na mesma entrega — disparos para
   grupos (`GroupBroadcast`) e para contatos (`Campaign`).
2. **Ao retomar:** o sistema **pergunta** se deve publicar agora ou esperar o
   horário já marcado. Não decide sozinho.
3. **Ao remover** um grupo/destinatário que já recebeu: **para de enviar, mas
   preserva o histórico** — ele continua no relatório, marcado como removido.

Uma quarta decisão, de abordagem, também validada: a edição reusa **o mesmo
formulário da criação**, pré-preenchido (Abordagem A), em vez de edição
granular por seção dentro do painel de detalhe (Abordagem B).

## 3. Por que isso é mais barato do que parece

Três mecanismos que o motor já tem, e que sustentam a edição sem invenção
nova:

1. **O motor já reagenda tudo do zero ao retomar.**
   `GroupBroadcastService.startBroadcast` (fases 1 e 2) e
   `CampaignService.scheduleAllPending` recalculam o atraso de cada envio a
   partir de "agora". Se a edição exigir campanha pausada, o próprio retomar
   reconcilia a fila — não é preciso sincronizar Redis durante a edição.
2. **Os processadores já toleram job órfão.**
   `GroupBroadcastSendJobProcessor` descarta o job quando o `stepTarget` não
   existe mais, mudou de etapa ou não está mais `pending`;
   `GroupBroadcastRunJobProcessor` descarta quando a etapa sumiu. Remover
   coisas durante a edição é seguro por construção.
3. **Materializar de novo é idempotente.**
   `initializeStepTargets` e `createRecipients` usam
   `createMany({ skipDuplicates: true })` sobre as constraints
   `@@unique([stepId, targetId])` e `@@unique([campaignId, contactId])`.
   Chamar de novo depois de adicionar grupos/etapas cria só o que falta.

## 4. Escopo

### 4.1 Entra

**Disparos para grupos** — editável: nome, lista de grupos, intervalo entre
grupos, janela de horário, cadência entre publicações
(`stepLaunchOffsetMinutes`), e a lista de publicações (adicionar, remover,
editar texto, editar recorrência). Mídia por publicação via a rota de upload
já existente.

**Disparos para contatos** — editável: nome, descrição, mensagem, contatos
selecionados e telefones soltos. Mídia via a rota de upload já existente.

### 4.2 Não entra (e por quê)

- **Trocar a sessão de WhatsApp da campanha.** Os grupos pertencem àquele
  número; trocar a sessão tornaria toda a lista de destinatários inválida. Para
  isso, criar outra campanha.
- **Expor ritmo, janela e teto diário em campanhas para contatos.**
  `CreateCampaignInput` não oferece esses campos hoje (usam os valores padrão
  do schema) e nenhuma tela os configura. Expô-los na edição seria funcionalidade
  nova, não edição — fora do escopo desta entrega.
- **Editar campanha concluída ou cancelada.** Em contatos, `reopenCampaign`
  já traz a campanha de volta; editar depois disso é o fluxo normal de pausada.
- **Reordenar publicações.** A `order` de cada etapa define o escalonamento
  inicial e já foi consumida pelas publicações que rodaram. Reordenar depois de
  ter publicado produziria uma cadência que não corresponde ao histórico.
  Adicionar e remover cobrem a necessidade real.

## 5. Regras por estado

| Estado | Comportamento |
|---|---|
| `draft` | Edita tudo |
| `paused` | Edita tudo (estado principal da funcionalidade) |
| `running` | API recusa com 409. A UI oferece "Pausar e editar", que pausa e abre o formulário |
| `completed` / `cancelled` | API recusa com 409. Botão desabilitado na UI, com o motivo |

**Invariante central: salvar uma edição nunca agenda nem dispara nada.**
Salvar apenas grava no Postgres. Quem coloca jobs na fila continua sendo
`startBroadcast` / `startCampaign`, acionados pelo botão Retomar. Esta
invariante tem teste dedicado.

Isto quebra de propósito a trava atual de mídia (`attachMedia` só em `draft`,
com o motivo registrado no código: "grupos já publicados receberiam uma coisa,
os seguintes outra"). A consequência continua verdadeira, mas passa a ser o
comportamento desejado: quem já recebeu ficou com o conteúdo antigo, e as
próximas publicações usam o novo.

## 6. Reconciliação

O cliente envia **o estado final desejado**. O servidor calcula a diferença.
Não existem operações granulares ("remova o grupo X") no contrato.

### 6.1 Publicações (etapas de um disparo em grupos)

Identificadas por `id`. Etapa sem `id` no payload é nova.

| Situação | Ação do servidor |
|---|---|
| Etapa existente, campos alterados | Atualiza `messageTemplate` e campos de recorrência. `runsCompleted`, `startedAt` e o histórico de `GroupBroadcastStepTarget` são preservados |
| Etapa nova | Cria com a próxima `order` livre; chama `initializeStepTargets` para materializar o progresso contra os alvos elegíveis. Como nasce com `runsCompleted = 0`, entra com o escalonamento inicial (`initialLaunchOffsetMs`) no próximo start |
| Etapa ausente do payload, `runsCompleted = 0` e sem nenhum `stepTarget` com `sentCount > 0` | Removida de vez (`delete`), junto com seus `stepTargets` |
| Etapa ausente do payload, já publicou | **Encerrada**: grava `finishedAt`. Para de repetir, sai do ciclo, e o histórico permanece no relatório |

Uma campanha precisa terminar a edição com **pelo menos uma etapa ativa**
(sem `finishedAt`). Payload que zeraria todas é recusado com 400.

### 6.2 Grupos (alvos de um disparo em grupos)

Identificados por `groupJid`.

| Situação | Ação do servidor |
|---|---|
| Grupo novo | **Conferido ao vivo** via `GroupDirectory.listGroups` antes de entrar, exatamente como na criação: grupo inexistente vira `group_not_found`, grupo só-admin onde o número não é admin vira `admin_only_group`. Cria o `GroupBroadcastTarget` e materializa os `stepTargets` |
| Grupo removido, nunca recebeu (`sentCount = 0` em todas as etapas) | Removido de vez |
| Grupo removido, já recebeu | `GroupBroadcastTarget.status = skipped` com `skipReason = 'removed_by_operator'`, **e** todos os seus `GroupBroadcastStepTarget` marcados `skipped`. Preserva `sentCount`. Como `resetStepTargetsForNextRun` nunca reabre `skipped`, ele fica fora das próximas repetições |

O teto de `MAX_GROUPS_PER_BROADCAST` (30) vale sobre o total de grupos ativos
depois da edição.

### 6.3 Destinatários (campanha para contatos)

Identificados por `contactId` (origem A) e por telefone normalizado (origens
B e C).

| Situação | Ação do servidor |
|---|---|
| Destinatário novo | Passa pelas regras de supressão de novo (`fetchEligibility` + `determineSkipReason`): opt-out, conversa ativa com humano na sessão, contatado por outra campanha da sessão nos últimos 7 dias |
| Removido, nunca recebeu (`status = PENDING` ou `SKIPPED`) | Removido de vez |
| Removido, já recebeu (`SENT`, `FAILED` ou `REPLIED`) | `status = SKIPPED` com `skipReason = 'removed_by_operator'`. Preserva `sentAt`, `repliedAt` e o vínculo com a conversa, para as métricas continuarem corretas |

O teto de 5.000 destinatários vale sobre o total ativo depois da edição.

## 7. API

```
PUT /api/tenants/:tenantId/group-broadcasts/:broadcastId
PUT /api/tenants/:tenantId/campaigns/:campaignId
```

Verbo `PUT` porque o corpo é o estado final completo, não um conjunto de
operações.

**Corpo (grupos):** `name`, `groupJids[]`, `intervalSeconds?`,
`sendWindowStart?`, `sendWindowEnd?`, `stepLaunchOffsetMinutes?`,
`steps[]` — cada etapa com `id?`, `messageTemplate`,
`recurrenceIntervalHours?`, `recurrenceMaxRuns?`, `recurrenceEndsAt?`.

**Corpo (contatos):** `name`, `description?`, `messageTemplate`,
`contactIds[]`, `phoneRecipients[]?`.

**Resposta:** o mesmo formato do detalhe (`GroupBroadcastDetail` /
`CreateCampaignResult`), para a tela se atualizar sem uma segunda chamada.

**Permissão:** `campaign:manage` — a mesma da criação. Editar tem o mesmo raio
de estrago que criar.

**Erros:** 409 para estado que não permite edição
(`InvalidGroupBroadcastTransitionError` / `InvalidCampaignTransitionError` com
a ação `'edit'`); 400 para payload inválido (nenhuma etapa ativa, nenhum
destinatário, teto excedido, recorrência inválida); 404 para campanha ou etapa
de outro tenant.

**Mídia:** as rotas de upload e remoção existentes passam a aceitar `paused`
além de `draft`. Nenhuma rota nova.

**Auditoria:** a edição grava em `AuditLog`
(`group_broadcast.edited` / `campaign.edited`), com um resumo numérico do que
mudou — grupos adicionados/removidos, etapas adicionadas/removidas/encerradas.
Segue a política já existente: falha de trilha nunca derruba a ação.

## 8. Interface

Os formulários de criação (`GroupBroadcastCreateForm`, `CampaignCreateForm`)
ganham **modo edição**: recebem a campanha existente e nascem preenchidos. Não
há tela nova.

| Onde | Comportamento |
|---|---|
| Tabela de disparos, menu "⋮" | Item **Editar** |
| Painel de detalhe, topo | Botão **Editar**, ao lado de Pausar/Cancelar |
| Campanha rodando | Botão vira **Pausar e editar**; confirma avisando que a campanha vai parar, e ao confirmar pausa e abre o formulário |
| Campanha concluída/cancelada | Botão desabilitado, com o motivo visível |

Dois comportamentos específicos da edição de grupos:

- A lista de grupos é buscada **ao vivo** ao abrir o formulário. Um grupo que
  estava na campanha mas não aparece mais na listagem (o número saiu do grupo)
  é exibido como **indisponível**, marcado, em vez de sumir sem explicação.
- Cada publicação mostra **quantas vezes já publicou**, para que editar uma
  etapa com histórico seja uma decisão consciente.

Ambas as telas seguem `.claude/rules/ui-telas-de-listagem.md` no que se aplica
(vocabulário "disparo", cor com significado, componentes compartilhados).

## 9. Retomar com escolha

Ao clicar em **Retomar** numa campanha que tem próxima execução marcada
(`GroupBroadcastStep.nextRunAt` preenchido em alguma etapa ativa), abre um
diálogo:

> **Retomar o disparo**
> A próxima publicação está marcada para *<data e hora>*.
> → Publicar agora
> → Esperar o horário marcado *(padrão)*

Sem horário marcado — campanha que nunca publicou, ou sem recorrência — **não
pergunta nada**: retoma direto, como hoje.

`startBroadcast` recebe um parâmetro novo `resumeMode: 'now' | 'scheduled'`
(padrão `'now'`, preservando o comportamento de todos os chamadores atuais).
Em `'scheduled'`, uma etapa que tenha `nextRunAt` no futuro é agendada para
aquele instante em vez de para agora; etapas sem `nextRunAt` seguem a regra
normal.

Isso também corrige um comportamento hoje silencioso: retomar publica
imediatamente, o que pode gerar duas publicações no mesmo grupo no mesmo dia —
o padrão que mais provoca remoção por administrador de grupo.

## 10. Testes

- **Função pura de reconciliação** (Domain): dada a lista atual e a lista
  desejada, decide o que criar, atualizar, encerrar e suprimir. É onde mora o
  risco, e é testável sem banco. Uma função para etapas, uma para alvos.
- **Serviço**: cada linha das tabelas 6.1, 6.2 e 6.3, mais as recusas por
  estado (409) e por payload inválido (400).
- **Trava de invariante**: salvar uma edição **não chama o dispatcher** —
  teste espionando o dispatcher e afirmando zero chamadas.
- **Integração contra Postgres real**: remover grupo/destinatário que já
  recebeu preserva `sentCount`/`sentAt` e o item continua aparecendo no
  relatório. Um Fake em memória nunca provaria isso.
- **Retomada**: `resumeMode: 'scheduled'` agenda para `nextRunAt`;
  `'now'` mantém o comportamento atual (não-regressão).
- **Frontend (jsdom)**: formulário em modo edição nasce preenchido; grupo
  indisponível aparece marcado; botão desabilitado nos estados terminais;
  diálogo de retomada só aparece quando há horário marcado.

## 11. Riscos e limites conhecidos

- **Editar não valida o conteúdo contra quem já recebeu.** Uma campanha que
  publicou 5 vezes e tem o texto trocado passa a publicar outra coisa nos
  mesmos grupos. É o comportamento pedido, mas é assimétrico com o histórico —
  por isso a tela mostra o contador de publicações de cada etapa.
- **A conferência ao vivo dos grupos depende do WhatsApp responder.** Se
  `GroupDirectory.listGroups` falhar, a edição falha inteira (mesmo
  comportamento da criação), em vez de gravar alvos sem conferência.
- **`order` das etapas nunca é reatribuída.** Remover a etapa 2 de quatro
  deixa as ordens 0, 2, 3. Isso é deliberado: `order` alimenta o escalonamento
  inicial e precisa continuar coerente com o que já rodou. A tela numera as
  publicações por posição, não por `order`.
- **Sem trava de concorrência.** Dois operadores editando a mesma campanha ao
  mesmo tempo: vence quem salvar por último. Irrelevante com um operador;
  vira problema real quando houver equipe, e aí pede versionamento otimista.
