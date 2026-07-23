import { Message } from '../../conversations/domain/entities/Message';
import { ConversationRepository } from '../../conversations/domain/repositories/ConversationRepository';
import { MessageRepository } from '../../conversations/domain/repositories/MessageRepository';
import { shouldAutoRespond } from '../../conversations/domain/policies/shouldAutoRespond';
import { AiReplyJobData } from '../../conversations/infrastructure/queues/AiReplyQueue';
import { OutboundMessageDispatcher } from '../../whatsapp/domain/dispatchers/OutboundMessageDispatcher';
import { Logger } from '../../../shared/domain/Logger';
import { PromptVersion } from '../domain/PromptVersion';
import { ConversationAiService } from './ConversationAiService';

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
 * 2. RE-CHECA `shouldAutoRespond(conversation)` — a MESMA função de Domain
 *    já usada por `MessageIngestionService` ao enfileirar (Bloco 2), mas
 *    chamada de novo aqui, agora com o estado ATUAL da conversa. Cobre o
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
 *    responsabilidade de quem chama.
 * 4. Chama `ConversationAiService.generateReply()` — a MESMA instância é
 *    responsável por gravar o `AiInteraction` em toda tentativa (Bloco 3b),
 *    então esta classe não grava nada por conta própria.
 * 5. Só quando `result.status === 'success'`, despacha via
 *    `OutboundMessageDispatcher.dispatch()` (ADR #54, decisão 1) — usando
 *    `result.aiInteractionId` (Bloco 4, ver `ConversationAiService`) como
 *    `aiInteractionId` do comando. Nos caminhos `'validation_rejected'`/
 *    `'provider_error'`, não há nada para enviar; a auditoria já foi
 *    gravada pelo próprio `ConversationAiService`, então esta classe só
 *    loga um aviso (nível `warn`) e retorna — não lança, não repete a
 *    gravação.
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
    private readonly historyLimit: number = DEFAULT_HISTORY_LIMIT,
  ) {}

  async process(data: AiReplyJobData): Promise<void> {
    const conversation = await this.conversationRepository.findById(data.conversationId);
    if (!conversation) {
      this.logger.warn('Job ai-reply descartado: conversa não encontrada', { ...data });
      return;
    }

    if (!shouldAutoRespond(conversation)) {
      this.logger.info('Job ai-reply descartado: conversa não está mais em modo bot (re-checagem)', {
        ...data,
        status: conversation.status,
      });
      return;
    }

    const recent = await this.messageRepository.listRecentByConversation(
      data.tenantId,
      data.conversationId,
      this.historyLimit,
    );
    const chronological: Message[] = [...recent].reverse();

    const result = await this.conversationAiService.generateReply(
      data.tenantId,
      data.conversationId,
      chronological,
      this.promptVersion,
    );

    if (result.status !== 'success') {
      this.logger.warn('Job ai-reply não gerou uma resposta enviável', {
        ...data,
        resultStatus: result.status,
      });
      return;
    }

    await this.outboundMessageDispatcher.dispatch({
      tenantId: data.tenantId,
      conversationId: data.conversationId,
      aiInteractionId: result.aiInteractionId,
      content: result.content,
    });

    // Feature N2 (auto-escalonamento): a IA sinalizou que quer passar para um
    // humano. Depois de enviar a mensagem de aviso (acima), coloca a conversa
    // em atendimento humano SEM dono (`assignedToUserId: null`) — ela entra na
    // fila de "aguardando humano" (dispara a notificação na Dashboard) e a IA
    // PARA de responder (`shouldAutoRespond` volta false), até um atendente
    // assumir ou devolver ao bot. Depois do dispatch de propósito: se o envio
    // falhar e o job for retentado, não escalamos uma conversa cuja mensagem de
    // aviso nunca saiu.
    if (result.escalate) {
      await this.conversationRepository.updateStatus(data.tenantId, data.conversationId, 'human', { assignedToUserId: null });
      this.logger.info('Conversa auto-escalada para atendimento humano pela IA', {
        tenantId: data.tenantId,
        conversationId: data.conversationId,
      });
    }
  }
}
