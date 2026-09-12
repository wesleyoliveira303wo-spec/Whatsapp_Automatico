import { WhatsAppConnectionRegistry } from '../application/WhatsAppConnectionRegistry';
import { OutboundMessageCommand } from '../domain/dispatchers/OutboundMessageDispatcher';
import { ConversationRepository } from '../../conversations/domain/repositories/ConversationRepository';
import { MessageRepository } from '../../conversations/domain/repositories/MessageRepository';
import { StageClassificationScheduler } from '../../conversations/domain/schedulers/StageClassificationScheduler';
import { AiInteractionRepository } from '../../ai/domain/repositories/AiInteractionRepository';
import { Logger } from '../../../shared/domain/Logger';

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Pausa entre o envio de cada parágrafo de uma resposta dividida em várias
 * mensagens (ver `splitReplyIntoParagraphs`, `services/ai`) — sem ela, os
 * balões chegariam praticamente simultâneos no WhatsApp do cliente, o que
 * não lê como alguém digitando e ainda corre o risco de parecer um disparo
 * em massa. 900ms é uma pausa perceptível mas curta — não uma escolha
 * validada por dado real. Movida para cá (Onda 3 do redesign, 2026-08-24) —
 * antes vivia em `AiReplyJobProcessor`, pausando ENTRE jobs independentes da
 * fila; agora pausa entre envios DENTRO da mesma execução de um único job
 * (ver docstring de `OutboundMessageCommand.content` para o porquê).
 */
const DEFAULT_PARAGRAPH_DELAY_MS = 900;

/**
 * Consome a fila `whatsapp-outbound` e entrega, de fato, a mensagem via
 * WhatsApp — Milestone 3, Bloco 4 (ADR #54, decisão 3). Instanciado
 * exclusivamente DENTRO do processo `apps/api` (único dono dos sockets
 * Baileys) — nunca em `worker.ts`. O wiring real deste componente no
 * processo HTTP de `apps/api` (composition root, consumo de fato da fila)
 * é escopo do Bloco 5, não deste bloco — esta classe já sai testada e
 * funcionalmente completa, mas ainda não “ligada” em `index.ts`.
 *
 * FLUXO de `consume()`:
 * 1. Busca a `Conversation` por `command.conversationId`
 *    (`ConversationRepository.findById()`, gap aditivo do Bloco 4) — dela
 *    vêm `sessionName` e `contactJid` (JID do destinatário), nunca
 *    carregados no payload do comando (ver docstring de
 *    `OutboundMessageCommand`). Se a conversa não existir mais (ex.:
 *    removida por retenção de dados entre o agendamento e o processamento),
 *    loga um warning e retorna sem lançar — não há mais para quem enviar,
 *    e isso não é uma falha transitória que valha a pena o BullMQ reprocessar
 *    (retry não mudaria o resultado).
 * 2. Resolve o `SessionManager` da sessão via
 *    `WhatsAppConnectionRegistry.getOrCreate(tenantId, sessionName)` —
 *    seguro aqui porque este processo é o único dono dos sockets (ADR #54).
 * 3. Para CADA item de `command.content` (Onda 3 do redesign, 2026-08-24 —
 *    ver docstring de `OutboundMessageCommand.content`), NA ORDEM, com uma
 *    pausa (`paragraphDelayMs`) antes de cada item além do primeiro: chama
 *    `sessionManager.sendMessage(contactJid, content)`.
 *
 * DECISÃO D4 (levantamento arquitetural do Bloco 4) — comportamento quando a
 * sessão não está viva NESTE processo (ex.: API acabou de reiniciar e
 * nenhuma chamada HTTP reconectou a sessão ainda, achado P3, ainda
 * Deferred): deliberadamente NÃO É tratado aqui com nenhum código especial.
 * `getOrCreate()` (síncrono, mero pooling — ver sua docstring) devolve, sem
 * conectar nada, um `SessionManager` cujo `provider` nunca teve `connect()`
 * chamado; `sendMessage()` delegado a esse provider lança
 * `WhatsAppNotConnectedError` (contrato já documentado em
 * `WhatsAppProvider.sendMessage()`), que este método NÃO CAPTURA — propaga
 * para fora de `consume()`, o processor do BullMQ Worker (Bloco 5) rejeita o
 * job, e o BullMQ aplica retry/backoff configurado. Ou seja: "falhar o job,
 * deixar o BullMQ reter/reprocessar" (D4) é uma CONSEQUÊNCIA de este método
 * nunca chamar `sessionManager.init()`, não uma lógica adicional — a session
 * só volta a responder quando reconectada por um caminho HTTP já existente
 * (operador via Dashboard) ou por um futuro mecanismo de bootstrap (P3).
 *
 * 4. Só DEPOIS do envio ter sucesso (decisão D3): cria a `Message` outbound
 *    (`MessageRepository.create()`, `occurredAt = now`) e vincula o
 *    `AiInteraction` de origem a ela (`AiInteractionRepository.
 *    linkMessage(command.aiInteractionId, message.id)`).
 *
 * RISCO ACEITO, DOCUMENTADO (não resolvido neste bloco — mesmo precedente já
 * usado no projeto para achados F4/ADR #16 do SessionManager): se
 * `sendMessage()` tiver sucesso mas `messageRepository.create()` ou
 * `aiInteractionRepository.linkMessage()` falharem DEPOIS, e o job for
 * reprocessado pelo BullMQ (retry), `sendMessage()` seria chamado de novo —
 * reenviando a MESMA mensagem ao contato uma segunda vez. O `jobId` (D2,
 * `aiInteractionId`) protege contra um SEGUNDO job sendo ENFILEIRADO
 * enquanto o primeiro está pendente, mas não protege contra o BullMQ
 * reexecutar o MESMO job após uma falha parcial dele mesmo — isso exigiria
 * uma checagem de "este `aiInteractionId` já foi vinculado a uma Message?"
 * antes de enviar, que exigiria um método de leitura em
 * `AiInteractionRepository` deliberadamente NÃO implementado ainda (YAGNI,
 * ver docstring do port: `listByTenant`/`sumCostByTenant` ficam como
 * extensão futura). Aceito como risco de MVP, na mesma categoria de
 * confiabilidade "at-least-once, não exactly-once" que toda fila BullMQ
 * deste projeto já assume — não implementado agora.
 */
export class OutboundCommandConsumer {
  constructor(
    private readonly connectionRegistry: WhatsAppConnectionRegistry,
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
    private readonly aiInteractionRepository: AiInteractionRepository,
    private readonly logger: Logger,
    private readonly paragraphDelayMs: number = DEFAULT_PARAGRAPH_DELAY_MS,
    private readonly sleepFn: (ms: number) => Promise<void> = defaultSleep,
  ) {}

  async consume(command: OutboundMessageCommand): Promise<void> {
    const conversation = await this.conversationRepository.findById(command.conversationId);
    if (!conversation) {
      this.logger.warn('Comando outbound descartado: conversa não encontrada', {
        tenantId: command.tenantId,
        conversationId: command.conversationId,
        aiInteractionId: command.aiInteractionId,
      });
      return;
    }

    const sessionManager = this.connectionRegistry.getOrCreate(
      conversation.tenantId,
      conversation.sessionName,
    );

    // Onda 3 do redesign (2026-08-24) — envia CADA item de `command.content`
    // sequencialmente, dentro desta mesma execução (nunca mais um job por
    // parágrafo — ver docstring de `OutboundMessageCommand.content` para a
    // causa raiz medida do bug que isso corrige). `linkMessage` só no
    // PRIMEIRO envio (mesmo comportamento de antes, quando só o primeiro
    // comando carregava `aiInteractionId`) — é o vínculo 1:1 com a
    // `AiInteraction` de origem, não faz sentido repetir por parágrafo.
    let lastMessageId: string | undefined;
    for (let index = 0; index < command.content.length; index += 1) {
      if (index > 0) {
        await this.sleepFn(this.paragraphDelayMs);
      }
      const content = command.content[index];
      await sessionManager.sendMessage(conversation.contactJid, content);

      const message = await this.messageRepository.create({
        tenantId: command.tenantId,
        conversationId: command.conversationId,
        direction: 'outbound',
        content,
        // Fase 1, Bloco F1.1 (ADR #90): todo envio outbound (IA ou operador
        // humano) continua sendo texto nesta rodada — envio de mídia PELO
        // operador é F1.3, ainda não implementado. Hardcoded, não herdado de
        // `command`, porque `OutboundMessageCommand` ainda não carrega tipo de
        // conteúdo (extensão natural quando F1.3 chegar).
        contentType: 'text',
        occurredAt: new Date(),
      });

      // `linkMessage` só faz sentido no fluxo da IA (há uma `AiInteraction`
      // para vincular à `Message` enviada). Mensagens do operador (N2) não
      // têm `aiInteractionId` — a `Message` outbound é criada normalmente
      // (aparece na timeline), mas não há interação de IA a vincular.
      if (index === 0 && command.aiInteractionId) {
        await this.aiInteractionRepository.linkMessage(command.aiInteractionId, message.id);
      }
      lastMessageId = message.id;
    }

    // Mensagem do ATENDENTE também é sinal de estágio ("fechado, te mando o
    // pix"). A da IA não agenda — a própria resposta já classificou.
    // Mensagem escrita por uma PESSOA: sem `aiInteractionId` (não veio da IA)
    // e sem `system` (não é o aviso automático de encaminhamento).
    const isFromAgent = !command.aiInteractionId && command.system !== true;
    if (isFromAgent && lastMessageId && this.stageClassificationScheduler) {
      try {
        await this.stageClassificationScheduler.schedule(
          command.tenantId,
          command.conversationId,
          lastMessageId,
        );
      } catch (error) {
        this.logger.warn('Falha ao agendar classificação de estágio após envio do atendente', {
          tenantId: command.tenantId,
          conversationId: command.conversationId,
          error,
        });
      }
    }
  }

  /** Classificação de estágio (2026-09-11) — opcional, injetada pela composição. */
  setStageClassificationScheduler(stageClassificationScheduler: StageClassificationScheduler): void {
    this.stageClassificationScheduler = stageClassificationScheduler;
  }

  private stageClassificationScheduler?: StageClassificationScheduler;
}
