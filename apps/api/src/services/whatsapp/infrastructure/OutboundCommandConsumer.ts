import { WhatsAppConnectionRegistry } from '../application/WhatsAppConnectionRegistry';
import { OutboundMessageCommand } from '../domain/dispatchers/OutboundMessageDispatcher';
import { ConversationRepository } from '../../conversations/domain/repositories/ConversationRepository';
import { MessageRepository } from '../../conversations/domain/repositories/MessageRepository';
import { AiInteractionRepository } from '../../ai/domain/repositories/AiInteractionRepository';
import { Logger } from '../../../shared/domain/Logger';

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
 * 3. Chama `sessionManager.sendMessage(contactJid, command.content)`.
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

    const sessionManager = this.connectionRegistry.getOrCreate(conversation.tenantId, conversation.sessionName);
    await sessionManager.sendMessage(conversation.contactJid, command.content);

    const message = await this.messageRepository.create({
      tenantId: command.tenantId,
      conversationId: command.conversationId,
      direction: 'outbound',
      content: command.content,
      occurredAt: new Date(),
    });

    // `linkMessage` só faz sentido no fluxo da IA (há uma `AiInteraction` para
    // vincular à `Message` enviada). Mensagens do operador (N2) não têm
    // `aiInteractionId` — a `Message` outbound é criada normalmente (aparece na
    // timeline), mas não há interação de IA a vincular.
    if (command.aiInteractionId) {
      await this.aiInteractionRepository.linkMessage(command.aiInteractionId, message.id);
    }
  }
}
