/**
 * Comando de envio outbound — Milestone 3, Bloco 4 (ADR #54, decisão 2).
 *
 * Deliberadamente MENOR que o payload originalmente esboçado em
 * `MILESTONE_003_AI_AUTORESPONDER.md` §2.8/§3-Bloco 4
 * (`{ tenantId, sessionName, conversationId, messageId, content,
 * idempotencyKey }`) — dois campos foram removidos, cada um por um motivo
 * concreto resolvido durante o levantamento arquitetural pré-Bloco 4:
 *
 * - `sessionName` (e o JID do destinatário, que o esboço original nem
 *   chegava a listar explicitamente): ambos já estão persistidos na
 *   `Conversation` (`sessionName`, `contactJid`) — carregá-los de novo no
 *   payload do job criaria uma SEGUNDA fonte de verdade que podia divergir
 *   da primeira (ex.: uma `Conversation` reatribuída a outra `sessionName`
 *   entre o agendamento e o processamento). `OutboundCommandConsumer` busca
 *   os dois via `ConversationRepository.findById(conversationId)` no momento
 *   de processar — mesmo racional de "buscar de novo, não confiar em cache
 *   antigo" já usado pela re-checagem de `shouldAutoRespond()` no worker de
 *   IA (achado F1 do Bloco 3b).
 * - `messageId`: no esboço original, seria o id da `Message` outbound. Mas a
 *   decisão D3 (levantamento arquitetural do Bloco 4) definiu que essa
 *   `Message` só é CRIADA depois do envio ter sucesso — não existe ainda no
 *   momento em que este comando é despachado. Substituído por
 *   `aiInteractionId`: identifica de forma única a TENTATIVA de resposta que
 *   originou este envio (`AiInteraction`, Bloco 3b) e é usado tanto como
 *   dado de negócio (`AiInteractionRepository.linkMessage()`, depois do
 *   envio) quanto como `jobId`/chave de idempotência do BullMQ (decisão D2)
 *   — um único campo cobrindo as duas necessidades do antigo
 *   `messageId`+`idempotencyKey` juntos.
 */
export interface OutboundMessageCommand {
  tenantId: string;
  conversationId: string;
  /**
   * Onda 3 do redesign (2026-08-24) — CAUSA RAIZ MEDIDA de um bug real
   * relatado pelo fundador ("o último balão vira o primeiro"): até esta
   * rodada, uma resposta de IA em N parágrafos virava N jobs INDEPENDENTES
   * nesta fila (`AiReplyJobProcessor` despachava um por um, com sleep entre
   * cada). Medido em produção (logs reais + reprodução isolada contra o
   * Redis real): mesmo com a fila configurada para `concurrency: 1` e sem
   * nenhum `delay` explícito, os jobs de uma mesma rajada eram processados
   * fora de ordem — em alguns casos um job simplesmente não deixava
   * nenhum rastro de log na aplicação (`OutboundCommandConsumer.consume()`
   * nunca executava de forma observável) mesmo o BullMQ registrando-o como
   * concluído, evidência de uma corrida real entre jobs concorrentes da
   * MESMA rajada — não uma falha de prompt nem do laço de despacho (ambos
   * confirmados corretos, na ordem certa, antes desta medição).
   *
   * A correção estrutural: uma resposta inteira (todos os parágrafos) vira
   * UM ÚNICO job. `OutboundCommandConsumer` envia cada item desta lista
   * SEQUENCIALMENTE, dentro da mesma execução — elimina de vez a
   * possibilidade de corrida entre parágrafos da mesma resposta, porque não
   * existem mais jobs independentes concorrendo entre si. Mensagens de
   * fluxo humano (operador, aviso de handoff) continuam funcionando
   * normalmente como uma lista de 1 item.
   */
  content: string[];
  /**
   * Id da `AiInteraction` que originou este envio (fluxo da IA, Bloco 4).
   * OPCIONAL desde a feature de resposta pelo operador (N2): mensagens de
   * humano não nascem de uma `AiInteraction`, então não têm este campo — e o
   * consumidor só faz `linkMessage` quando ele está presente. No fluxo da IA
   * continua sempre preenchido (comportamento idêntico ao do Bloco 4).
   */
  aiInteractionId?: string;
  /**
   * Chave de idempotência / `jobId` do BullMQ para envios que NÃO vêm da IA
   * (operador respondendo pela Dashboard) — um UUID gerado por envio. No fluxo
   * da IA fica ausente: lá o `aiInteractionId` já é a chave (relação 1:1). O
   * dispatcher usa `aiInteractionId ?? idempotencyKey` como `jobId`, então cada
   * caminho tem sua própria chave sem colidir com o outro.
   */
  idempotencyKey?: string;
}

/**
 * Porta (port) de despacho de mensagens outbound — Milestone 3, Bloco 4
 * (ADR #54, decisão 1/2). Único canal de saída que o worker de IA
 * (`apps/api/src/worker.ts`) tem para o WhatsApp: NUNCA importa
 * `WhatsAppConnectionRegistry`/`WhatsAppProvider` diretamente (ver docstring
 * de `MILESTONE_003_AI_AUTORESPONDER.md` §2.8) — só conhece este port,
 * pequeno e sem nenhuma menção a BullMQ, socket ou Baileys.
 *
 * Implementação real (`BullMqOutboundMessageDispatcher`, Infrastructure)
 * publica na fila `whatsapp-outbound`; quem efetivamente entrega a mensagem
 * é `OutboundCommandConsumer` (Infrastructure, instanciado DENTRO do
 * processo `apps/api`, nunca em `worker.ts` — único processo dono dos
 * sockets Baileys).
 */
export interface OutboundMessageDispatcher {
  dispatch(command: OutboundMessageCommand): Promise<void>;
}
