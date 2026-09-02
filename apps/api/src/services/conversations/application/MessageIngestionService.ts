import {
  MessageReceivedHandler,
  InboundWhatsAppMessage,
} from '../../whatsapp/domain/handlers/MessageReceivedHandler';
import { Conversation } from '../domain/entities/Conversation';
import { ConversationRepository } from '../domain/repositories/ConversationRepository';
import { MessageRepository } from '../domain/repositories/MessageRepository';
import { AiReplyScheduler } from '../domain/schedulers/AiReplyScheduler';
import { AiAvailabilityRepository } from '../domain/repositories/AiAvailabilityRepository';
import { AiRateLimiter } from '../domain/repositories/AiRateLimiter';
import { ContactResolver } from '../domain/repositories/ContactResolver';
import { OptOutDetector } from '../domain/repositories/OptOutDetector';
import { CampaignReplyTracker } from '../domain/repositories/CampaignReplyTracker';
import { TenantPlanRepository } from '../domain/repositories/TenantPlanRepository';
import { shouldAutoRespond } from '../domain/policies/shouldAutoRespond';
import { planPermiteUso } from '../../../shared/tenant/domain/planPermiteUso';
import {
  DEFAULT_BOT_REACTIVATION_SILENCE_MS,
  isWaitingForHumanUnowned,
  shouldReactivateBot,
} from '../domain/policies/shouldReactivateBot';

/**
 * Implementa `MessageReceivedHandler` (porta de `services/whatsapp/domain`,
 * Bloco 1) — é o ÚNICO ponto de contato entre `services/whatsapp` e
 * `services/conversations`, injetado opcionalmente em `SessionManager`
 * (ainda não wired em nenhum composition root real; isso é Bloco 5).
 *
 * Fluxo de `handle()` (Milestone 3, Bloco 2 — ver
 * `MILESTONE_003_AI_AUTORESPONDER.md` §3):
 * 1. Encontra ou cria a `Conversation` de (`tenantId`, `sessionName`,
 *    `from`) — atomicamente, via `ConversationRepository.upsertByTenantSessionAndContact`.
 *    `contactName` (Milestone 6, Bloco M6H-2b — `pushName` do WhatsApp, se o
 *    evento trouxe) viaja junto nesse mesmo `create`; a decisão de
 *    ATUALIZAR ou não um nome já salvo é da implementação do repositório
 *    (`PrismaConversationRepository`), não deste Service.
 * 2. Persiste a `Message` inbound.
 * 3. REATIVAÇÃO DO BOT (evolução N2, 2026-07-23): se a conversa está
 *    aguardando humano sem dono (foi escalada, ninguém assumiu) e ficou em
 *    silêncio por >= `botReactivationSilenceMs` (30 min por padrão), devolve
 *    ao bot ANTES do passo 4 — assim o cliente que volta a escrever depois de
 *    um tempo é atendido de novo pela IA, em vez de ficar mudo para sempre.
 *    O silêncio é medido pelo intervalo até a última mensagem anterior (não
 *    por `Conversation.updatedAt`, que o upsert do passo 1 acabou de bumpar).
 * 4. Se a conversa está em modo `'bot'` E a IA da sessão está ligada
 *    (`shouldAutoRespond`, Fase 1/2026-08-07: Botão POWER — ver
 *    `AiAvailabilityRepository`) — de origem ou recém-reativada no passo 3 —,
 *    agenda uma resposta de IA via `AiReplyScheduler.schedule(...)` — nunca
 *    chama nenhum serviço de IA diretamente (§2.1: "`MessageIngestionService`
 *    e `ConversationAiService` NUNCA se chamam diretamente"). Com o Botão
 *    POWER desligado, o job simplesmente NUNCA é enfileirado — a mensagem
 *    ainda é persistida e aparece na Dashboard normalmente (passos 1-3 acima
 *    são incondicionais), só não gera nenhum trabalho de IA. Isto é
 *    deliberado (pedido do fundador): religar a IA depois NÃO deve fazer o
 *    sistema "voltar" e responder mensagens antigas recebidas enquanto
 *    estava desligada — como nada foi enfileirado, não há o que reprocessar.
 *
 * Erros de qualquer uma das etapas propagam para cima: `SessionManager`
 * (Bloco 1) já envolve a chamada a `MessageReceivedHandler.handle()` num
 * try/catch que loga a falha sem deixar propagar para o restante do fluxo de
 * eventos do provider — não há necessidade de duplicar esse tratamento aqui.
 */
export class MessageIngestionService implements MessageReceivedHandler {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
    private readonly aiReplyScheduler: AiReplyScheduler,
    private readonly aiAvailabilityRepository: AiAvailabilityRepository,
    // Fase 1, Bloco F1.10 (estabilidade para beta) — contém rajadas de
    // mensagens ANTES de virarem custo de IA (ver docstring de
    // `AiRateLimiter`). Porta própria, mesmo racional de
    // `AiAvailabilityRepository`: `MessageIngestionService` só precisa saber
    // "posso agendar ou não", não como o limite é calculado.
    private readonly aiRateLimiter: AiRateLimiter,
    // Fase L, Bloco L1 — identidade durável de contato. Porta estreita (ver
    // `ContactResolver`), mesmo racional de `AiAvailabilityRepository`: este
    // Service só precisa saber "quem é a pessoa deste endereço".
    private readonly contactResolver: ContactResolver,
    // Fase L, Bloco L2 — opt-out automático por palavra-chave. Porta estreita
    // (ver `OptOutDetector`), mesmo racional de `ContactResolver`.
    private readonly optOutDetector: OptOutDetector,
    // Lançamento suave (2026-08-31) — Trava de plano. Porta estreita (ver
    // `TenantPlanRepository`), mesmo racional de `AiAvailabilityRepository`:
    // este Service só precisa saber "o plano permite resposta automática?".
    private readonly tenantPlanRepository: TenantPlanRepository,
    private readonly botReactivationSilenceMs: number = DEFAULT_BOT_REACTIVATION_SILENCE_MS,
    /**
     * Fase L, Bloco L6 — OPCIONAL (mesmo padrão de `mediaSender` em
     * `ConversationsService`): a composição de `conversations` é montada
     * ANTES da de `campaigns` em `index.ts` (D15), então esta dependência só
     * existe depois, via `setCampaignReplyTracker`. Sem ela configurada
     * (modo degradado, sem `REDIS_URL`), respostas a campanha simplesmente
     * não são marcadas `REPLIED` — nunca impede a ingestão da mensagem.
     */
    private campaignReplyTracker?: CampaignReplyTracker,
  ) {}

  /** Injeção tardia (Fase L, Bloco L6) — mesmo motivo de `ConversationsService.setMediaSender`. */
  setCampaignReplyTracker(campaignReplyTracker: CampaignReplyTracker): void {
    this.campaignReplyTracker = campaignReplyTracker;
  }

  async handle(message: InboundWhatsAppMessage): Promise<void> {
    // ADR #97: mensagens enviadas pelo operador de outro dispositivo chegam com
    // `direction='outbound'`. Devem ser persistidas para espelhar o histórico
    // real do WhatsApp, mas não devem:
    //   - incrementar o contador de não lidas (não é o cliente escrevendo);
    //   - acionar a lógica de reativação do bot (o operador está ativo);
    //   - agendar resposta da IA (o operador já está respondendo).
    const isOutbound = (message.direction ?? 'inbound') === 'outbound';

    const conversation = await this.conversationRepository.upsertByTenantSessionAndContact(
      message.tenantId,
      message.sessionName,
      message.from,
      {
        id: crypto.randomUUID(),
        tenantId: message.tenantId,
        sessionName: message.sessionName,
        contactJid: message.from,
        // Para mensagens outbound, `pushName` seria o nome do próprio operador
        // — não do contato. Omitir evita sobrescrever o nome do contato já salvo.
        contactName: isOutbound ? undefined : message.contactName,
        status: 'bot',
        unreadCount: 0,
        // Pipeline de CRM (Milestone 6, Bloco M6H-5) — toda conversa nasce em
        // 'new', classificável pela IA (`stageSetBy: 'ai'`) até que um humano
        // corrija manualmente (ver `shouldAiUpdateStage`). Só tem efeito na
        // CRIAÇÃO: `upsertByTenantSessionAndContact` nunca sobrescreve esses
        // campos numa conversa já existente (mesmo racional de `status`).
        stage: 'new',
        stageSetBy: 'ai',
        stageUpdatedAt: message.receivedAt,
        // ADR #94 (2026-08-01) — toda conversa nasce dentro do funil
        // comercial; só um humano marca o contrário depois.
        excludedFromPipeline: false,
        // Menu "⋮" da conversa (2026-08-29) — toda conversa nasce visível
        // (não arquivada); só um humano arquiva depois.
        archived: false,
        createdAt: message.receivedAt,
        updatedAt: message.receivedAt,
        // Redesign 2026-08-05 (R4) — não lido pelo `create` do Prisma (tags
        // não são um campo escalar, ver `PrismaConversationRepository`); só
        // existe aqui para satisfazer a interface `Conversation`.
        tags: [],
        // Redesign 2026-08-05 (R5) — resumo por IA nasce sempre vazio; só
        // existe aqui para satisfazer a interface `Conversation` (o `create`
        // do Prisma nem grava este valor — a coluna já tem `@default(0)`).
        aiSummaryMessageCount: 0,
      },
    );

    // Reativação do bot: só faz sentido AVALIAR (uma consulta a mais) quando a
    // conversa está aguardando humano sem dono. Não se aplica a mensagens
    // outbound — se o operador está respondendo pelo celular, o bot não deve
    // ser reativado por isso. A medição do silêncio usa a última mensagem
    // ANTES da que está chegando, por isso é feita antes de criar a nova
    // mensagem abaixo.
    const effectiveConversation =
      !isOutbound && isWaitingForHumanUnowned(conversation)
        ? await this.maybeReactivateBot(conversation, message.receivedAt)
        : conversation;

    const createdMessage = await this.messageRepository.create({
      tenantId: message.tenantId,
      conversationId: conversation.id,
      // ADR #97: usa a direção real da mensagem; `undefined` ≡ 'inbound'
      // (compatibilidade total com emissores anteriores a esta extensão).
      direction: message.direction ?? 'inbound',
      content: message.content,
      // Fase 1, Bloco F1.1 (ADR #90): `InboundWhatsAppMessage` ganhou os
      // campos opcionais `contentType`/`media` para o bloco seguinte
      // (F1.1-3, `BaileysProvider` reconhecendo mídia de verdade) — até lá,
      // todo emissor real (`SessionManager`) ainda só produz mensagens de
      // texto, então o fallback `?? 'text'` cobre 100% do tráfego atual sem
      // mudar comportamento nenhum.
      contentType: message.contentType ?? 'text',
      media: message.media,
      occurredAt: message.receivedAt,
    });

    // Indicador de não lidas (2026-07-25): apenas mensagens INBOUND incrementam
    // o contador — mensagens enviadas pelo operador não são "não lidas" para a
    // Dashboard. Zerado só quando um humano abre a conversa
    // (`ConversationsService.markAsRead`). Resiliente: uma falha aqui não
    // deve impedir o fluxo principal — loga e segue.
    if (!isOutbound) {
      try {
        await this.conversationRepository.incrementUnreadCount(message.tenantId, conversation.id);
      } catch {
        // Silencioso de propósito: o indicador de não lidas é auxiliar, sua
        // falha não deve derrubar a ingestão da mensagem em si.
      }
    }

    // Fase L, Bloco L1 — identidade durável da pessoa. Auxiliar por desenho:
    // um try/catch envolve tudo (mesmo padrão de `incrementUnreadCount` acima),
    // porque o vínculo com o contato jamais pode impedir uma mensagem de
    // cliente de ser recebida. Roda também para mensagens outbound: se o
    // operador escreveu primeiro pelo celular, a pessoa existe do mesmo jeito.
    //
    // `linkContact` só preenche quando ainda está vazio, então a partir da
    // segunda mensagem esta chamada é uma escrita que não casa com nada —
    // barata e idempotente, sem precisar checar antes.
    let contactId = conversation.contactId;
    if (!contactId) {
      try {
        const resolvedContactId = await this.contactResolver.resolveByWhatsAppJid(
          message.tenantId,
          message.from,
        );
        if (resolvedContactId) {
          await this.conversationRepository.linkContact(
            message.tenantId,
            conversation.id,
            resolvedContactId,
          );
          contactId = resolvedContactId;
        }
      } catch {
        // Silencioso de propósito: o resolver já não lança e já loga; este
        // catch cobre apenas uma falha do `linkContact`. Identidade é dado
        // auxiliar — a mensagem já foi persistida e o atendimento continua.
      }
    }

    // Fase L, Bloco L2 — opt-out automático por palavra-chave. Só para
    // INBOUND (um comando "PARAR" digitado pelo OPERADOR não é um pedido do
    // cliente) e só quando há identidade resolvida (sem contato, não há o
    // que marcar). `detectAndRecord` nunca lança — auxiliar, mesmo padrão do
    // bloco de resolução de contato acima.
    if (!isOutbound && contactId) {
      await this.optOutDetector.detectAndRecord(message.tenantId, contactId, message.content);
    }

    // Fase L, Bloco L6 — marca REPLIED se esta conversa nasceu de campanha.
    // Só para INBOUND (o operador respondendo não é o "lead respondendo"),
    // chaveado por `conversationId` (não `contactId` — não precisa de
    // identidade resolvida). `markRepliedIfCampaignOrigin` nunca lança.
    if (!isOutbound && this.campaignReplyTracker) {
      await this.campaignReplyTracker.markRepliedIfCampaignOrigin(
        message.tenantId,
        conversation.id,
      );
    }

    if (!isOutbound) {
      const sessionAiEnabled = await this.aiAvailabilityRepository.isEnabled(
        message.tenantId,
        message.sessionName,
      );
      // Trava de plano (Lançamento suave, 2026-08-31): tenant no Plano Grátis
      // não gera resposta automática. A mensagem já foi persistida/exibida
      // acima (passos 1-3) — só não vira trabalho de IA, exatamente como o
      // Botão POWER desligado.
      const tenantPlanAllowsAutoReply = planPermiteUso(
        await this.tenantPlanRepository.getPlan(message.tenantId),
      );
      if (shouldAutoRespond(effectiveConversation, sessionAiEnabled, tenantPlanAllowsAutoReply)) {
        // Fase 1, Bloco F1.10 — segundo portão, IMEDIATAMENTE antes de gerar
        // custo de IA: `shouldAutoRespond` já decidiu que a IA DEVERIA
        // responder; `aiRateLimiter` decide se isso não excede o ritmo
        // seguro desta conversa/sessão agora. Estourou o limite: não
        // enfileira (nenhum custo de IA gerado), a mensagem já foi
        // persistida normalmente (visível na Dashboard), e sinalizamos
        // atenção humana com o MESMO mecanismo já usado quando a IA falha
        // em gerar uma resposta (`flagNeedsHumanAttention` — dispara o
        // alerta/som/contador já existentes, sem inventar nenhuma UX nova).
        // A janela é deslizante: a PRÓXIMA mensagem, depois que a rajada
        // esfriar, volta a ser respondida normalmente — nenhuma ação manual
        // necessária para "destravar".
        const withinRateLimit = this.aiRateLimiter.consume(
          message.tenantId,
          message.sessionName,
          conversation.id,
        );
        if (withinRateLimit) {
          await this.aiReplyScheduler.schedule(
            message.tenantId,
            conversation.id,
            createdMessage.id,
          );
        } else {
          try {
            await this.conversationRepository.flagNeedsHumanAttention(
              message.tenantId,
              conversation.id,
              message.receivedAt,
            );
          } catch {
            // Mesmo espírito do `incrementUnreadCount` acima: sinalização é
            // auxiliar, sua falha não deve derrubar a ingestão da mensagem.
          }
        }
      }
    }
  }

  /**
   * Se a conversa (aguardando humano sem dono) ficou em silêncio além do
   * limite, devolve ao bot (`updateStatus('bot', { assignedToUserId: null })`)
   * e retorna a conversa já atualizada; caso contrário, retorna a original
   * inalterada. `lastActivityAt` = `occurredAt` da mensagem mais recente antes
   * desta (ou `createdAt` da conversa, se ainda não houver mensagens — caso de
   * borda improvável, mas seguro).
   */
  private async maybeReactivateBot(conversation: Conversation, now: Date): Promise<Conversation> {
    const [lastMessage] = await this.messageRepository.listRecentByConversation(
      conversation.tenantId,
      conversation.id,
      1,
    );
    const lastActivityAt = lastMessage?.occurredAt ?? conversation.createdAt;

    if (!shouldReactivateBot(conversation, now, lastActivityAt, this.botReactivationSilenceMs)) {
      return conversation;
    }

    const reverted = await this.conversationRepository.updateStatus(
      conversation.tenantId,
      conversation.id,
      'bot',
      { assignedToUserId: null },
    );
    // `updateStatus` devolve `undefined` só se a conversa sumiu no meio (corrida
    // improvável) — nesse caso mantém a original (o passo 4 então não agenda IA,
    // porque ela ainda está em 'human').
    return reverted ?? conversation;
  }
}
