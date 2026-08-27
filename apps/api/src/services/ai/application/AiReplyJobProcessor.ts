import { randomUUID } from 'crypto';

import { ConversationRepository } from '../../conversations/domain/repositories/ConversationRepository';
import { MessageRepository } from '../../conversations/domain/repositories/MessageRepository';
import { shouldAutoRespond } from '../../conversations/domain/policies/shouldAutoRespond';
import { shouldAiUpdateStage } from '../../conversations/domain/policies/shouldAiUpdateStage';
import { shouldGenerateReply } from '../../conversations/domain/policies/shouldGenerateReply';
import {
  detectAutomatedLoop,
  DEFAULT_AUTOMATED_LOOP_EXCHANGES_TO_CHECK,
  DEFAULT_AUTOMATED_LOOP_MAX_REPLY_LATENCY_MS,
} from '../../conversations/domain/policies/detectAutomatedLoop';
import {
  trimHistoryToCurrentSession,
  DEFAULT_SESSION_GAP_MS,
} from '../../conversations/domain/policies/trimHistoryToCurrentSession';
import { AiReplyJobData } from '../../conversations/infrastructure/queues/AiReplyQueue';
import { OutboundMessageDispatcher } from '../../whatsapp/domain/dispatchers/OutboundMessageDispatcher';
import { Logger } from '../../../shared/domain/Logger';
import { PromptVersion } from '../domain/PromptVersion';
import { splitReplyIntoParagraphs } from '../domain/messageSplitting';
import { AiBusinessProfileRepository } from '../domain/repositories/AiBusinessProfileRepository';
import { AiPreferencesRepository } from '../domain/repositories/AiPreferencesRepository';
import { ConversationAiService } from './ConversationAiService';

/**
 * Mensagem enviada ao cliente quando a IA NÃO conseguiu gerar uma resposta
 * enviável (resposta vazia, reprovada na validação, ou erro do provider) —
 * antes de escalar para um humano. Substitui o silêncio anterior: em vez de a
 * conversa sumir para a fila sem o cliente saber de nada, ele recebe um aviso
 * educado de que está sendo encaminhado. Texto genérico de propósito (não
 * revela o motivo técnico da falha ao cliente). Overridável pelo construtor
 * (mesmo padrão de `DEFAULT_HISTORY_LIMIT`) — pode virar configurável por
 * tenant no futuro (Base de Conhecimento), sem mudar esta classe.
 */
const DEFAULT_HUMAN_HANDOFF_MESSAGE =
  'Desculpe, não consegui responder a sua mensagem agora. Já estou encaminhando você para um de nossos atendentes, que vai continuar o seu atendimento em instantes. 🙏';

/**
 * Valor DEFAULT de quantas mensagens recentes da conversa entram no
 * histórico enviado ao provider de IA — mesmo padrão de
 * `DEFAULT_MAX_REPLY_LENGTH` (`ConversationAiService`)/`DEFAULT_MAX_TOKENS`
 * (`ClaudeAiProvider`): uma constante local, não hardcoded dentro do método,
 * overridável via parâmetro do construtor. Não é uma decisão de produto (o
 * número certo depende de custo de tokens vs. qualidade de contexto, e deve
 * ser calibrado com uso real) — 20 mensagens (~10 turnos de ida e volta) é
 * um ponto de partida razoável, não uma escolha validada por dados. Nenhum
 * critério de aceite do `MILESTONE_003_AI_AUTORESPONDER.md` especifica este
 * número; fica registrado aqui como decisão de implementação do Bloco 4,
 * não do levantamento arquitetural (que não previu esta variável).
 */
const DEFAULT_HISTORY_LIMIT = 20;

/**
 * CORREÇÃO 2026-08-18 (achado real: cota diária grátis do Gemini esgotada —
 * 20 requisições/dia — deixou duas conversas travadas em falha por HORAS, e
 * o cliente nunca recebeu nem o aviso de encaminhamento, porque
 * `escalatedAt` já estava preenchido de uma escalada de 11 DIAS atrás nunca
 * assumida por ninguém). "Não repetir o aviso" fazia sentido para não
 * mandar a mesma desculpa 3-4 vezes seguidas na MESMA rajada de falhas
 * (ADR #79) — mas, sem expirar, também significava nunca mais avisar o
 * cliente enquanto a conversa ficasse escalada, por mais tempo que passasse.
 * Depois desta janela, uma nova falha volta a avisar o cliente (e também
 * "reabre a contagem": a próxima falha só volta a suprimir depois de
 * esperar a janela de novo).
 */
const DEFAULT_HANDOFF_NOTICE_REPEAT_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * Orquestra o processamento de UM job da fila `ai-reply` — Milestone 3,
 * Bloco 4. Deliberadamente extraído de `worker.ts` (que só instancia esta
 * classe com dependências reais e a liga a um `bullmq.Worker`): mantém a
 * MESMA separação já usada em toda a Milestone 3 entre "regra de
 * orquestração" (testável com Fakes, sem infraestrutura real) e "wiring de
 * infraestrutura" (BullMQ `Worker`, conexão Redis — só testável com
 * integração real, por isso não faz parte desta classe).
 *
 * Fluxo de `process()`, na ordem exigida por
 * `MILESTONE_003_AI_AUTORESPONDER.md` §3-Bloco4/§5:
 * 1. Busca a `Conversation` via `ConversationRepository.findById()`. Se não
 *    existir mais (ex.: dado inconsistente, exclusão concorrente), descarta
 *    o job silenciosamente (loga e retorna) — não há para quem responder.
 * 2. RE-CHECA `shouldAutoRespond(conversation, sessionAiEnabled)` — a MESMA
 *    função de Domain já usada por `MessageIngestionService` ao enfileirar
 *    (Bloco 2), mas chamada de novo aqui, agora com o estado ATUAL da
 *    conversa E da IA da sessão (Fase 1, 2026-08-07: Botão POWER — lido de
 *    `AiBusinessProfileRepository`, mesma fonte usada pelo restante deste
 *    fluxo para o Cérebro da IA). Cobre o
 *    risco explícito da Milestone (§5: "Job na fila processado depois que a
 *    conversa já foi escalonada") — um job pode ter sido enfileirado quando
 *    a conversa ainda estava em modo `'bot'` e, por qualquer atraso da fila
 *    (BullMQ, rede, backoff), ser processado só depois de um humano assumir.
 * 3. Busca o histórico recente via `MessageRepository.listRecentByConversation()`
 *    (Bloco 4a) — que devolve do mais novo para o mais antigo (mesma
 *    convenção de `WhatsAppSessionEventRepository`) — e INVERTE a ordem
 *    antes de repassar ao `ConversationAiService`: `PromptBuilder` espera
 *    histórico cronológico (mais antigo primeiro), exatamente como a
 *    docstring de `listRecentByConversation()` já avisava que seria
 *    responsabilidade de quem chama. Em seguida, `trimHistoryToCurrentSession`
 *    (pedido do fundador, 2026-08-24) corta esse histórico na última sessão
 *    ativa — um gap de 24h+ (configurável) sem nenhuma mensagem encerra a
 *    "sessão" de contexto; um cliente que volta depois disso não carrega a
 *    conversa antiga para a IA, mesmo ela continuando gravada no banco.
 * 4. Chama `ConversationAiService.generateReply()` — a MESMA instância é
 *    responsável por gravar o `AiInteraction` em toda tentativa (Bloco 3b),
 *    então esta classe não grava nada por conta própria.
 * 5. Só quando `result.status === 'success'`, divide `result.content` em
 *    parágrafos (`splitReplyIntoParagraphs`, Fase 1/2026-08-07) e despacha
 *    UM ÚNICO `OutboundMessageDispatcher.dispatch()` (ADR #54, decisão 1)
 *    carregando TODOS os parágrafos (`content: string[]`) — correção
 *    estrutural da Onda 3 do redesign (2026-08-24): é
 *    `OutboundCommandConsumer` quem envia cada parágrafo sequencialmente,
 *    com a pausa entre eles, dentro da MESMA execução de job (nunca mais
 *    jobs independentes por parágrafo — ver docstring de
 *    `OutboundMessageCommand.content` para a causa raiz medida do bug que
 *    isso corrige). Nos caminhos `'validation_rejected'`/
 *    `'provider_error'`, não há nada para enviar; a auditoria já foi
 *    gravada pelo próprio `ConversationAiService`, então esta classe só
 *    loga um aviso (nível `warn`) e retorna — não lança, não repete a
 *    gravação.
 * 6. Pipeline de CRM (Milestone 6, Bloco M6H-5, 2026-07-30): depois do
 *    dispatch, se `result.suggestedStage` veio preenchido E a policy
 *    `shouldAiUpdateStage(conversation, suggestedStage)` permitir (o estágio
 *    sugerido não é uma regressão no funil — ADR #89), grava o novo `stage`
 *    via `ConversationRepository.updateStage(..., 'ai')`. Desde a ADR #89 a
 *    IA reclassifica SEMPRE, inclusive conversas já corrigidas à mão; o que
 *    ela nunca faz é mover um card para trás.
 *
 * FRONTEIRA DA ADR #54 (achado crítico do levantamento pré-Bloco 4): esta
 * classe NUNCA importa, direta ou indiretamente,
 * `WhatsAppConnectionRegistry`/`WhatsAppProvider`/qualquer implementação
 * concreta de socket — a única saída para o canal WhatsApp é
 * `OutboundMessageDispatcher` (port), injetado no construtor. `worker.ts`
 * (entrypoint que instancia esta classe) segue a mesma regra.
 *
 * IDEMPOTÊNCIA: não é responsabilidade desta classe (achado F1 do Bloco
 * 3b/3B, já documentado em `ConversationAiService`) — um job `ai-reply`
 * reentregue pelo BullMQ (retry) reexecuta `process()` do zero, gerando uma
 * nova tentativa e um novo `AiInteraction`. A deduplicação de ENVIO (não de
 * geração) é responsabilidade do `jobId` da fila `whatsapp-outbound`
 * (decisão D2, `aiInteractionId` como chave) — cada tentativa bem-sucedida
 * produz um `aiInteractionId` novo, então mesmo duas gerações para o mesmo
 * job `ai-reply` reentregue produziriam dois comandos outbound distintos,
 * não deduplicados entre si. Aceito como risco residual do MVP, mesmo
 * espírito do risco já documentado em `OutboundCommandConsumer` — corrigir
 * isso de verdade exigiria uma chave de idempotência derivada de
 * `tenantId`+`conversationId`+`messageId` (o `AiReplyJobData` original),
 * checada ANTES de gerar uma nova resposta; não implementado agora (YAGNI,
 * mesmo racional já registrado no Bloco 3b).
 */
export class AiReplyJobProcessor {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
    private readonly conversationAiService: ConversationAiService,
    private readonly outboundMessageDispatcher: OutboundMessageDispatcher,
    private readonly promptVersion: PromptVersion,
    private readonly logger: Logger,
    private readonly aiBusinessProfileRepository: AiBusinessProfileRepository,
    private readonly historyLimit: number = DEFAULT_HISTORY_LIMIT,
    private readonly humanHandoffMessage: string = DEFAULT_HUMAN_HANDOFF_MESSAGE,
    // CORREÇÃO 2026-08-18 — ver docstring de `DEFAULT_HANDOFF_NOTICE_REPEAT_AFTER_MS`.
    private readonly handoffNoticeRepeatAfterMs: number = DEFAULT_HANDOFF_NOTICE_REPEAT_AFTER_MS,
    private readonly now: () => Date = () => new Date(),
    // Pedido do fundador (2026-08-24) — ver docstring de `trimHistoryToCurrentSession`.
    private readonly sessionGapMs: number = DEFAULT_SESSION_GAP_MS,
    /**
     * Cérebro da IA v3, Fase 3 (2026-08-26) — OPCIONAL, mesmo padrão de
     * `aiBusinessProfileRepository`: sem ele configurado, `sendHumanHandoffNotice`
     * sempre usa `this.humanHandoffMessage` (comportamento inalterado). Com
     * ele, uma sessão que configurou `customHandoffMessage` recebe SUA
     * própria mensagem de encaminhamento, em vez do texto padrão do sistema.
     */
    private readonly aiPreferencesRepository?: AiPreferencesRepository,
    /**
     * Válvula de segurança contra LOOP DE AUTOMAÇÃO (pedido do fundador,
     * 2026-08-27) — ver docstring de `detectAutomatedLoop`. Defaults
     * herdados da própria policy (3 trocas, 3s) — expostos aqui só para
     * permitir calibração futura com uso real, mesmo padrão de
     * `historyLimit`/`handoffNoticeRepeatAfterMs`.
     */
    private readonly automatedLoopExchangesToCheck: number = DEFAULT_AUTOMATED_LOOP_EXCHANGES_TO_CHECK,
    private readonly automatedLoopMaxReplyLatencyMs: number = DEFAULT_AUTOMATED_LOOP_MAX_REPLY_LATENCY_MS,
  ) {}

  async process(data: AiReplyJobData): Promise<void> {
    const conversation = await this.conversationRepository.findById(data.conversationId);
    if (!conversation) {
      this.logger.warn('Job ai-reply descartado: conversa não encontrada', { ...data });
      return;
    }

    // Fase 1 (2026-08-07) — Botão POWER: RE-CHECA aqui também, não só em
    // `MessageIngestionService` ao enfileirar — mesmo racional já usado para
    // `status`/`excludedFromPipeline` (§5 da Milestone 3: a fila pode
    // demorar, e a IA pode ter sido desligada DEPOIS que este job já estava
    // na fila). "Sem perfil ainda" = `true` (ligado), mesmo default do
    // `AiAvailabilityRepository`.
    const profile = await this.aiBusinessProfileRepository.findByTenantAndSession(
      data.tenantId,
      conversation.sessionName,
    );
    const sessionAiEnabled = profile?.aiEnabled ?? true;

    if (!shouldAutoRespond(conversation, sessionAiEnabled)) {
      this.logger.info(
        'Job ai-reply descartado: conversa não está mais em modo bot, fora do funil, ou IA da sessão desligada (re-checagem)',
        {
          ...data,
          status: conversation.status,
          sessionAiEnabled,
        },
      );
      return;
    }

    const recent = await this.messageRepository.listRecentByConversation(
      data.tenantId,
      data.conversationId,
      this.historyLimit,
    );
    // Pedido do fundador (2026-08-24) — corta para a sessão ATUAL antes de
    // qualquer outro uso do histórico (agrupamento de rajada incluído): um
    // cliente que sumiu por 24h+ e voltou não deve ler como continuação da
    // conversa antiga, nem para a IA responder nem para decidir se uma
    // mensagem faz parte de uma rajada em andamento. O banco continua com a
    // conversa inteira — ver docstring de `trimHistoryToCurrentSession`.
    // `sessionRestarted` é usado mais abaixo para liberar `shouldAiUpdateStage`
    // a reclassificar o estágio livremente (a IA decide se é "Novo" interesse
    // ou continuação do mesmo pedido, lendo só a mensagem atual).
    const { messages: chronological, sessionRestarted } = trimHistoryToCurrentSession(
      [...recent].reverse(),
      this.sessionGapMs,
    );

    // AGRUPAMENTO DE RAJADA (2026-08-14) — segundo portão, depois de
    // `shouldAutoRespond` e antes de qualquer custo de IA. `shouldAutoRespond`
    // responde "esta conversa aceita resposta automática?"; esta policy
    // responde "este job é o que deve gerá-la?". Numa rajada de fragmentos,
    // só o job da mensagem mais recente segue adiante — os demais encerram
    // aqui, sem chamar o provider. Ver `shouldGenerateReply` (Domain) para o
    // porquê de a decisão ser de ESTADO e não de deduplicação de fila.
    //
    // Reusa o histórico já lido acima: nenhuma consulta nova.
    if (!shouldGenerateReply(chronological, data.messageId)) {
      this.logger.info(
        'Job ai-reply encerrado: chegou mensagem mais recente nesta conversa (agrupamento de rajada)',
        { ...data },
      );
      return;
    }

    // VÁLVULA DE SEGURANÇA CONTRA LOOP DE AUTOMAÇÃO (pedido do fundador,
    // 2026-08-27) — terceiro portão, depois de `shouldGenerateReply` e ainda
    // ANTES de qualquer chamada ao provider de IA. Cenário real que motivou
    // isto: um disparo de campanha (Fase L) atinge um número que também é um
    // robô/auto-resposta, e as duas automações passam a se responder
    // indefinidamente — cada rodada gastando uma chamada de IA de verdade.
    //
    // `detectAutomatedLoop` (Domain, ver sua docstring para o desenho
    // completo) só devolve `true` quando DOIS sinais aparecem JUNTOS nas
    // últimas `automatedLoopExchangesToCheck` trocas: ritmo rápido demais
    // para ser humano E conteúdo repetitivo/eco. Reusa o histórico já lido
    // acima — nenhuma consulta nova, nenhuma chamada de IA para detectar.
    //
    // AÇÃO DELIBERADAMENTE DIFERENTE do caminho de falha logo abaixo: aqui
    // NÃO enviamos nenhum aviso de encaminhamento — não há um cliente humano
    // do outro lado para ler o aviso, então mandar mais uma mensagem seria só
    // desperdiçar mais um envio. Só sinalizamos internamente
    // (`flagNeedsHumanAttention`) para um humano revisar depois, e paramos
    // por aqui. Como `status` continua `'bot'`, o PRÓXIMO job desta conversa
    // (se a automação do outro lado insistir) vai re-detectar o mesmo padrão
    // e encerrar de novo, sempre ANTES de gastar Gemini — a proteção se
    // sustenta sozinha, sem precisar de nenhum estado permanente novo. Se o
    // padrão parar (ex.: um humano de verdade assume do outro lado), a
    // próxima checagem simplesmente deixa de bater e a IA volta a responder.
    if (
      detectAutomatedLoop(
        chronological,
        this.automatedLoopExchangesToCheck,
        this.automatedLoopMaxReplyLatencyMs,
      )
    ) {
      this.logger.warn(
        'Job ai-reply encerrado: padrão de automação detectado do outro lado (ritmo rápido demais + conteúdo repetido) — parando de responder para não gastar cota da IA',
        { ...data },
      );
      await this.flagNeedsHumanAttention(data.tenantId, data.conversationId, 'loop_automatizado');
      return;
    }

    const result = await this.conversationAiService.generateReply(
      data.tenantId,
      data.conversationId,
      chronological,
      this.promptVersion,
      conversation.sessionName,
      // Fase 1, Bloco F1.4 (2026-08-01): vincula o AiInteraction gerado à
      // mensagem inbound que o originou (a pergunta do cliente).
      data.messageId,
    );

    if (result.status !== 'success') {
      // A IA não conseguiu gerar uma resposta enviável (cota do provider
      // esgotada, erro de rede/API, ou resposta reprovada na validação).
      //
      // Reforma do escalonamento (2026-07-25, pedido do fundador): em vez de
      // colocar a conversa em `status: 'human'` sem dono — o que tirava a IA
      // do circuito e podia deixar o cliente sem NENHUMA resposta até um
      // atendente aparecer —, apenas SINALIZAMOS que um humano precisa dar
      // uma olhada (`flagNeedsHumanAttention`, dispara o alerta/som/contador
      // na Dashboard). `status` continua `'bot'`: a IA segue tentando
      // responder as PRÓXIMAS mensagens desta conversa normalmente. A
      // auditoria da falha já foi gravada pelo `ConversationAiService` (toda
      // tentativa gera um `AiInteraction`).
      this.logger.warn(
        'Job ai-reply não gerou uma resposta enviável — avisando o cliente e sinalizando para um humano',
        {
          ...data,
          resultStatus: result.status,
        },
      );
      // Avisa o cliente educadamente que está sendo encaminhado — nunca
      // deixá-lo no silêncio (pedido do usuário). O envio é resiliente
      // (try/catch dentro do método): se o WhatsApp estiver fora, o
      // sinalizador é gravado mesmo assim.
      //
      // MAS só na PRIMEIRA falha desta rodada de escalonamento (2026-08-14,
      // bug real observado em produção): como a reforma de 2026-07-25 mantém
      // a IA no circuito depois de escalar, uma sequência de falhas (ex.:
      // cliente manda 5 mensagens seguidas e a cota do provider estoura)
      // fazia o MESMO texto de desculpa ser enviado uma vez por falha — o
      // cliente recebia o mesmo pedido de desculpas três, quatro vezes
      // seguidas, o que parece defeito e não atendimento.
      //
      // `escalatedAt` já é exatamente o registro de "a IA pediu ajuda e
      // ninguém assumiu ainda": é gravado por `flagNeedsHumanAttention` e só
      // é LIMPO quando um humano de fato age (assumir/devolver ao bot, via
      // `ConversationsService`). Então: preenchido = o cliente já foi
      // avisado, não repetir.
      //
      // O alerta INTERNO (`flagNeedsHumanAttention`) continua disparando em
      // toda falha, de propósito — ele atualiza o timestamp e mantém o
      // contador/som da Dashboard vivo (requisito da ADR #79: "escalada
      // repetida dispara um novo alerta"). O que foi silenciado é só a
      // repetição VOLTADA AO CLIENTE.
      const msSinceUltimoAviso = conversation.escalatedAt
        ? this.now().getTime() - conversation.escalatedAt.getTime()
        : null;
      const clienteJaAvisado =
        msSinceUltimoAviso !== null && msSinceUltimoAviso < this.handoffNoticeRepeatAfterMs;
      if (clienteJaAvisado) {
        this.logger.info(
          'Aviso de encaminhamento suprimido: cliente já foi avisado recentemente nesta escalada',
          { ...data, escalatedAt: conversation.escalatedAt, msSinceUltimoAviso },
        );
      } else {
        await this.sendHumanHandoffNotice(
          data.tenantId,
          data.conversationId,
          conversation.sessionName,
        );
      }
      await this.flagNeedsHumanAttention(data.tenantId, data.conversationId, 'falha_da_ia');
      return;
    }

    // Fase 1 (pedido do fundador, 2026-08-07): a resposta é dividida em
    // parágrafos e enviada como VÁRIAS mensagens outbound, não um balão único
    // de texto grande — ver docstring de `splitReplyIntoParagraphs`.
    //
    // Onda 3 do redesign (2026-08-24) — CORREÇÃO ESTRUTURAL: até esta rodada,
    // cada parágrafo virava um JOB INDEPENDENTE nesta fila (jobIds
    // `aiInteractionId`/`aiInteractionId-p1`/`aiInteractionId-p2`, um `sleep`
    // entre cada `dispatch()`). Medido em produção que isso causava uma
    // corrida real entre os jobs da MESMA rajada — ver a docstring de
    // `OutboundMessageCommand.content` para o detalhe completo da medição.
    // Agora despacha UM ÚNICO comando carregando todos os parágrafos; é
    // `OutboundCommandConsumer` quem envia cada um sequencialmente, dentro da
    // mesma execução — sem mais jobs concorrentes por resposta, então sem
    // mais corrida possível entre parágrafos.
    const paragraphs = splitReplyIntoParagraphs(result.content);
    await this.outboundMessageDispatcher.dispatch({
      tenantId: data.tenantId,
      conversationId: data.conversationId,
      content: paragraphs,
      aiInteractionId: result.aiInteractionId,
    });

    // Feature N2 (auto-escalonamento), reformada em 2026-07-25: a IA
    // sinalizou (marcador) que um humano deveria dar uma olhada. Depois de
    // enviar sua PRÓPRIA resposta (que já inclui o aviso ao cliente — acima),
    // apenas MARCA a conversa como precisando de atenção (`escalatedAt`),
    // SEM mudar `status`/`assignedToUserId` — a IA continua respondendo
    // normalmente enquanto ninguém assume; só uma ação humana explícita
    // (`ConversationsService.escalateConversation`, "Assumir conversa") tira
    // a IA do circuito. Depois do dispatch de propósito: se o envio falhar e
    // o job for retentado, não sinalizamos uma conversa cuja mensagem de
    // aviso nunca saiu.
    if (result.escalationReason) {
      await this.flagNeedsHumanAttention(data.tenantId, data.conversationId, 'decisao_da_ia');
    }

    // Pipeline de CRM (Milestone 6, Bloco M6H-5, 2026-07-30): aplica o
    // estágio sugerido pela IA, na MESMA condição de `shouldAutoRespond` já
    // garantida pela re-checagem do topo de `process()` (`conversation.status
    // === 'bot'`) — nenhuma checagem adicional de status é necessária aqui.
    // A policy `shouldAiUpdateStage` cobre a condição extra de "só para
    // frente" — EXCETO quando `sessionRestarted` (pedido do fundador,
    // 2026-08-24): aí a IA classificou lendo só a mensagem nova, sem
    // nenhuma pista da conversa antiga, então essa classificação vale mesmo
    // que regrida o card (ver docstring de `shouldAiUpdateStage`). Depois do
    // dispatch, de propósito (mesmo racional do `escalate` acima): se o
    // envio falhar e o job for retentado, melhor não ter mudado o estágio de
    // uma resposta que nunca chegou ao cliente.
    const podeAtualizarEstagio = result.suggestedStage
      ? shouldAiUpdateStage(conversation, result.suggestedStage, sessionRestarted)
      : false;

    if (result.suggestedStage && podeAtualizarEstagio) {
      await this.conversationRepository.updateStage(
        data.tenantId,
        data.conversationId,
        result.suggestedStage,
        'ai',
      );
    }
  }

  /**
   * Envia ao cliente o aviso educado de encaminhamento para atendimento humano
   * (`humanHandoffMessage`) — usado só no caminho de FALHA da IA (resposta
   * vazia/reprovada/erro do provider), NÃO na auto-escalação por marcador
   * (nesse caso a própria IA já escreveu uma mensagem de despedida). Usa
   * `idempotencyKey` (não `aiInteractionId`): esta mensagem é do SISTEMA, não
   * de uma tentativa de IA bem-sucedida — mesmo mecanismo das mensagens de
   * operador (N2).
   *
   * RESILIÊNCIA (try/catch): se o envio falhar (ex.: WhatsApp momentaneamente
   * indisponível), NÃO propaga — o escalonamento para humano precisa acontecer
   * de qualquer forma (melhor a conversa entrar na fila de atendimento do que o
   * job falhar e reprocessar, o que poderia reenviar o aviso). A falha do envio
   * fica registrada no log.
   */
  private async sendHumanHandoffNotice(
    tenantId: string,
    conversationId: string,
    sessionName: string,
  ): Promise<void> {
    try {
      const message = await this.resolveHandoffMessage(tenantId, sessionName);
      await this.outboundMessageDispatcher.dispatch({
        tenantId,
        conversationId,
        idempotencyKey: randomUUID(),
        content: [message],
      });
    } catch (error) {
      this.logger.warn(
        'Falha ao enviar aviso de encaminhamento para humano (escalonamento segue mesmo assim)',
        {
          tenantId,
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Cérebro da IA v3, Fase 3 (2026-08-26) — resolve a mensagem de
   * encaminhamento a usar: a `customHandoffMessage` da SESSÃO, se
   * configurada, senão `this.humanHandoffMessage` (o texto padrão do
   * sistema). DEGRADAÇÃO GRACIOSA (mesmo racional de
   * `ConversationAiService.loadPreferencesContext`): sem repositório
   * configurado, sem preferências salvas, ou qualquer falha na leitura,
   * cai no texto padrão — a mensagem de encaminhamento é auxiliar, sua
   * personalização nunca pode impedir o cliente de ser avisado.
   */
  private async resolveHandoffMessage(tenantId: string, sessionName: string): Promise<string> {
    if (!this.aiPreferencesRepository) {
      return this.humanHandoffMessage;
    }
    try {
      const preferences = await this.aiPreferencesRepository.findByTenantAndSession(
        tenantId,
        sessionName,
      );
      return preferences?.customHandoffMessage?.trim() || this.humanHandoffMessage;
    } catch {
      return this.humanHandoffMessage;
    }
  }

  /**
   * Sinaliza que a conversa precisa de atenção humana (`Conversation.
   * escalatedAt`), SEM tirar a IA do circuito — `status`/`assignedToUserId`
   * não mudam aqui. Dispara o alerta/badge/som "aguardando atendente" na
   * Dashboard (`useWaitingForHuman`); a IA continua respondendo normalmente
   * até um atendente clicar "Assumir conversa". Sempre GRAVA um timestamp
   * novo, mesmo numa conversa já sinalizada — é assim que uma escalada
   * REPETIDA (outra pergunta que a IA também não soube responder) dispara um
   * novo alerta, não só a primeira. Ponto único de escalonamento, usado por
   * dois caminhos:
   *   - `decisao_da_ia`: a IA emitiu o marcador de escalonamento (feature N2).
   *   - `falha_da_ia`: a geração falhou (cota, provider, validação) e não há o
   *     que enviar — melhor avisar um humano do que deixar o lead no vácuo.
   *   - `loop_automatizado` (2026-08-27): `detectAutomatedLoop` identificou
   *     ritmo+conteúdo típicos de automação do outro lado — a IA para de
   *     responder para não gastar cota respondendo a outro robô.
   * `reason` entra no log só para diagnóstico (por que a conversa escalou).
   */
  private async flagNeedsHumanAttention(
    tenantId: string,
    conversationId: string,
    reason: 'decisao_da_ia' | 'falha_da_ia' | 'loop_automatizado',
  ): Promise<void> {
    await this.conversationRepository.flagNeedsHumanAttention(tenantId, conversationId, new Date());
    this.logger.info(
      'Conversa sinalizada como precisando de atenção humana (IA continua respondendo)',
      {
        tenantId,
        conversationId,
        reason,
      },
    );
  }
}
