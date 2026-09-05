import { AiProviderName } from '../providers/AiProviderName';
import { EscalationReason } from '../escalationSignal';

/**
 * Registro de auditoria/billing de UMA tentativa de geração de resposta de
 * IA — Milestone 3, Bloco 3b (`MILESTONE_003_AI_AUTORESPONDER.md` §2.4).
 * Append-only, gravado em TODA tentativa (sucesso, validação rejeitada, erro
 * do provider) — mesmo padrão de `WhatsAppSessionEvent`/`Message` (log
 * imutável, sem `updatedAt`).
 *
 * `conversationId`/`messageId` são strings simples, não uma FK Prisma — ver
 * `PrismaAiInteractionRepository`/`prisma/schema.prisma` (model
 * `AiInteraction`): um log de auditoria/billing deve sobreviver à exclusão
 * da conversa que audita (mesmo racional já usado 2x neste projeto:
 * `TenantCredential` sem FK para `WhatsAppSession`, ADR #21;
 * `WhatsAppSessionEvent` chaveado por `tenantId`+`sessionName`, ADR #49).
 *
 * `messageId` é opcional e, neste bloco, é SEMPRE `undefined` — o Bloco 3b
 * ainda não cria a `Message` outbound com a resposta da IA (isso só
 * acontece quando o envio de fato ocorre, via `OutboundCommandConsumer`,
 * Bloco 4). O campo já existe aqui porque faz parte do formato de
 * `AiInteraction` definido em `MILESTONE_003_AI_AUTORESPONDER.md` §2.4, mas
 * nenhum código deste bloco o preenche — ver `ConversationAiService`.
 *
 * `model` é opcional: no caminho `'provider_error'`, a chamada ao provider
 * falhou antes de qualquer resposta chegar, então o `model` real (que só
 * `AiGenerationResult.model`, devolvido pela API, revela) nunca é
 * conhecido. Refinamento descoberto durante a implementação deste bloco —
 * não estava explícito no levantamento arquitetural original.
 *
 * `costUsd` é `string`, não `Prisma.Decimal` — nenhuma entidade de Domain
 * deste projeto importa um tipo do Prisma (nem `WhatsAppSession`, nem
 * `Message`), e este arquivo não abre exceção. Representa um valor decimal
 * exato (nunca `number`/`Float` — arredondamento de ponto flutuante não é
 * aceitável para dinheiro). `PrismaAiInteractionRepository` grava esta
 * string diretamente no campo `Decimal` do Postgres — o driver do Prisma
 * aceita `string` como entrada válida para colunas `Decimal`, então não é
 * necessário importar `Prisma.Decimal` como valor em nenhum lugar deste
 * bloco (ver docstring de `PrismaAiInteractionRepository`).
 *
 * `status` não inclui `'timeout'` neste bloco — mesmo racional já registrado
 * em `ConversationAiResult` (Bloco 3a): nenhum código deste projeto ainda
 * distingue timeout de outros erros de provider.
 */
export interface AiInteraction {
  id: string;
  tenantId: string;
  conversationId: string;
  /** A mensagem OUTBOUND enviada como resposta (`linkMessage()`, depois do envio). */
  messageId?: string;
  /**
   * A mensagem INBOUND que originou a tentativa: a PERGUNTA do cliente.
   *
   * Coluna própria desde 2026-09-05, por causa de um bug real: o F1.4 gravava
   * a pergunta em `messageId`, e o `OutboundCommandConsumer` sobrescrevia essa
   * mesma coluna com a resposta logo depois do envio — então a tela de
   * "perguntas que a IA não soube responder" mostrava o que a IA RESPONDEU.
   * Dois fatos distintos exigem duas colunas.
   */
  inboundMessageId?: string;
  provider: AiProviderName;
  model?: string;
  promptVersion: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: string;
  latencyMs: number;
  status: 'success' | 'validation_rejected' | 'provider_error';
  errorMessage?: string;
  /**
   * Fase 1, Bloco F1.4 (2026-08-01) — presente quando a IA escalou para
   * atendimento humano nesta tentativa (`status: 'success'` E a resposta
   * incluía um marcador de escalonamento). `undefined` = não escalou, ou a
   * interação foi gravada antes deste bloco. Ver `EscalationReason` para o
   * significado de cada valor.
   */
  escalationReason?: EscalationReason;
  createdAt: Date;
}
