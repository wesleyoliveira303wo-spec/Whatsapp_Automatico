import { AiInteraction } from '../entities/AiInteraction';
import { UnansweredQuestion } from '../entities/UnansweredQuestion';

/**
 * Porta (port) de persistência de `AiInteraction` — Milestone 3, Bloco 3b.
 *
 * `record()`+`linkMessage()` neste bloco — mesmo racional já registrado em
 * `MessageRepository` (Bloco 2, "só `create()` por enquanto") e reforçado
 * pelo achado F3 da auditoria técnica do Bloco 3a (`getPromptVersion()` sem
 * nenhum chamador): `listByTenant()`/`sumCostByTenant()`
 * (`MILESTONE_003_AI_AUTORESPONDER.md` §2.4, "para consultas futuras de
 * billing") não têm nenhum consumidor até o Bloco 5 (endpoint de
 * billing/auditoria) — adicioná-los agora repetiria exatamente o tipo de
 * código sem uso que a auditoria acabou de sinalizar. Ficam registrados
 * aqui como extensão aditiva futura, não implementados agora (YAGNI).
 *
 * `linkMessage()` foi adicionado como preparação arquitetural aditiva
 * (achado F2, aprovado — auditoria pós-Bloco 3b): NENHUM código deste
 * projeto chama este método ainda. Ele existe para que o Bloco 4 (worker de
 * IA), quando existir, consiga vincular um `AiInteraction` já gravado à
 * `Message` outbound criada depois do envio — sem precisar reabrir o
 * contrato deste port outra vez. Nenhuma lógica de fila, worker,
 * deduplicação ou wiring foi implementada junto; só a forma do port.
 */
export interface AiInteractionRepository {
  /**
   * Persiste um novo registro de auditoria/billing. `id`/`createdAt` são
   * gerados pela implementação — mesmo padrão de
   * `MessageRepository.create()`/`WhatsAppSessionEventRepository.append()`.
   *
   * Devolve o `id` gerado (mudança de assinatura do achado F2, aprovada —
   * antes devolvia `void`): necessário para que um chamador futuro (Bloco 4)
   * consiga referenciar esta interação específica depois, via
   * `linkMessage(id, messageId)`, quando a `Message` outbound correspondente
   * for criada. Retrocompatível na prática: `ConversationAiService`
   * (único chamador de produção hoje) já só fazia `await
   * this.aiInteractionRepository.record(...)` sem usar o retorno — nenhuma
   * linha desse arquivo mudou.
   */
  record(interaction: Omit<AiInteraction, 'id' | 'createdAt'>): Promise<string>;

  /**
   * Vincula um `AiInteraction` já gravado à `Message` outbound criada
   * depois (preenche `AiInteraction.messageId`). Método NOVO, aditivo
   * (achado F2) — sem nenhum chamador de produção ainda; existe só para que
   * o Bloco 4 não precise alterar este port quando a lógica de envio
   * outbound for implementada. `interactionId` é o valor devolvido por uma
   * chamada anterior a `record()`.
   */
  linkMessage(interactionId: string, messageId: string): Promise<void>;

  /**
   * Lista as interações de IA de UMA conversa, da mais recente para a mais
   * antiga (Milestone 3, Bloco 5 — D13 do levantamento arquitetural: suporta
   * `GET .../ai-interactions?conversationId=`). `limit` obrigatório (mesmo
   * racional de `MessageRepository.listRecentByConversation`) — quem aplica
   * o default/teto é `AiInteractionsService`. `tenantId` explícito por
   * defesa em profundidade: a implementação real filtra por AMBOS
   * (`tenantId` E `conversationId`), nunca confia só no `conversationId`
   * vindo de fora — mesmo racional já documentado em
   * `MessageRepository.listRecentByConversation`. Se `conversationId`
   * pertencer a outro tenant, devolve lista vazia (não lança, não vaza
   * existência de dados de outro tenant).
   */
  listByConversation(
    tenantId: string,
    conversationId: string,
    limit: number,
  ): Promise<AiInteraction[]>;

  /**
   * Lista as interações de IA de um tenant inteiro, da mais recente para a
   * mais antiga (Milestone 3, Bloco 5 — D13: cobre o caso em que
   * `conversationId` é omitido na query string, servindo de base para uma
   * futura tela agregada de billing/auditoria — `sumCostByTenant()` continua
   * YAGNI, sem consumidor real ainda).
   */
  listByTenant(tenantId: string, limit: number): Promise<AiInteraction[]>;

  /**
   * Fase 1, Bloco F1.4 (2026-08-01) — critério de aceite: "uma consulta
   * simples já consegue listar as N perguntas mais recentes que a IA não
   * soube responder". Filtra por `status = 'success'` E
   * `escalationReason = 'unknown_answer'` (a IA respondeu normalmente ao
   * cliente, mas sinalizou que não sabia — distinto de `'requested_human'`,
   * que não é uma lacuna de conteúdo). `tenantId` obrigatório (mesmo
   * racional de defesa em profundidade dos demais métodos deste port);
   * `messageId` costuma estar presente (é o `id` da pergunta original), mas
   * não é garantido para interações gravadas antes deste bloco.
   *
   * Bloco B3 (issue #14) — passou a devolver o read model
   * `UnansweredQuestion` (pergunta + contato + sessão), não `AiInteraction`
   * cru: a tela precisa do TEXTO perguntado, que mora na `Message` apontada
   * por `messageId`, e de quem perguntou, que mora na `Conversation`. Ver a
   * docstring de `UnansweredQuestion` para o porquê de não ser uma entidade
   * persistida.
   *
   * `sessionName` é OBRIGATÓRIO — diferente de `listByTenant`. A tela que
   * consome isto vive dentro do Cérebro da IA, que é 1:1 por sessão desde o
   * M6H-3 (ADR #82): uma lacuna de conhecimento só faz sentido contra o
   * Cérebro daquele WhatsApp específico, e o produto inteiro já trata cada
   * sessão como uma empresa independente (M6H-1).
   */
  listUnansweredQuestions(
    tenantId: string,
    sessionName: string,
    limit: number,
    /**
     * Restringe a UMA conversa — usado pela timeline, que precisa saber quais
     * bolhas daquela conversa carregam uma lacuna. Ausente lista a sessão
     * inteira (a tela de FAQ).
     */
    conversationId?: string,
  ): Promise<UnansweredQuestion[]>;
}
