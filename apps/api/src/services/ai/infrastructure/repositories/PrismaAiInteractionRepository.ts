import type {
  PrismaClient,
  AiProviderType as PrismaAiProviderType,
  AiInteractionStatus as PrismaAiInteractionStatus,
  AiEscalationReason as PrismaAiEscalationReason,
} from '@prisma/client';

import { AiInteraction } from '../../domain/entities/AiInteraction';
import { AiInteractionRepository } from '../../domain/repositories/AiInteractionRepository';
import { AiProviderName } from '../../domain/providers/AiProviderName';
import { EscalationReason } from '../../domain/escalationSignal';

const PROVIDER_TO_PRISMA: Record<AiProviderName, PrismaAiProviderType> = {
  claude: 'CLAUDE' as PrismaAiProviderType,
  openai: 'OPENAI' as PrismaAiProviderType,
  gemini: 'GEMINI' as PrismaAiProviderType,
};

const STATUS_TO_PRISMA: Record<AiInteraction['status'], PrismaAiInteractionStatus> = {
  success: 'SUCCESS' as PrismaAiInteractionStatus,
  validation_rejected: 'VALIDATION_REJECTED' as PrismaAiInteractionStatus,
  provider_error: 'PROVIDER_ERROR' as PrismaAiInteractionStatus,
};

const PRISMA_TO_PROVIDER: Record<string, AiProviderName> = {
  CLAUDE: 'claude',
  OPENAI: 'openai',
  GEMINI: 'gemini',
};

const PRISMA_TO_STATUS: Record<string, AiInteraction['status']> = {
  SUCCESS: 'success',
  VALIDATION_REJECTED: 'validation_rejected',
  PROVIDER_ERROR: 'provider_error',
};

/** Fase 1, Bloco F1.4 (2026-08-01) — mesmo padrão de `STATUS_TO_PRISMA`/`PRISMA_TO_STATUS`. */
const ESCALATION_REASON_TO_PRISMA: Record<EscalationReason, PrismaAiEscalationReason> = {
  unknown_answer: 'UNKNOWN_ANSWER' as PrismaAiEscalationReason,
  requested_human: 'REQUESTED_HUMAN' as PrismaAiEscalationReason,
};

const PRISMA_TO_ESCALATION_REASON: Record<string, EscalationReason> = {
  UNKNOWN_ANSWER: 'unknown_answer',
  REQUESTED_HUMAN: 'requested_human',
};

/**
 * Shape mínimo lido do banco para `listByConversation`/`listByTenant`
 * (Milestone 3, Bloco 5) — mesmo racional já documentado em
 * `PrismaConversationRepository.ts`/`PrismaWhatsAppSessionRepository.ts`:
 * só os campos que este repositório de fato lê de volta, não o tipo
 * completo gerado pelo Prisma. `costUsd` tipado como `{ toString(): string
 * }` (não `Prisma.Decimal` como VALOR) para preservar a disciplina de só
 * `import type` deste arquivo — o Prisma Client devolve uma instância de
 * `Decimal` para colunas `Decimal`, e `.toString()` produz a representação
 * decimal exata (nunca `Number()`, que arredondaria em ponto flutuante).
 */
interface AiInteractionRow {
  id: string;
  tenantId: string;
  conversationId: string;
  messageId: string | null;
  provider: string;
  model: string | null;
  promptVersion: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: { toString(): string };
  latencyMs: number;
  status: string;
  errorMessage: string | null;
  escalationReason: string | null;
  createdAt: Date;
}

function toDomain(row: AiInteractionRow): AiInteraction {
  return {
    id: row.id,
    tenantId: row.tenantId,
    conversationId: row.conversationId,
    messageId: row.messageId ?? undefined,
    provider: PRISMA_TO_PROVIDER[row.provider],
    model: row.model ?? undefined,
    promptVersion: row.promptVersion,
    tokensInput: row.tokensInput,
    tokensOutput: row.tokensOutput,
    costUsd: row.costUsd.toString(),
    latencyMs: row.latencyMs,
    status: PRISMA_TO_STATUS[row.status],
    errorMessage: row.errorMessage ?? undefined,
    escalationReason: row.escalationReason
      ? PRISMA_TO_ESCALATION_REASON[row.escalationReason]
      : undefined,
    createdAt: row.createdAt,
  };
}

/**
 * Implementação concreta de `AiInteractionRepository` sobre o model
 * `AiInteraction` (`prisma/schema.prisma`, Milestone 3, Bloco 3b).
 *
 * Só `import type` de `@prisma/client` (mesmo padrão de
 * `PrismaMessageRepository.ts`/`PrismaConversationRepository.ts`) — nenhum
 * valor do Prisma é importado neste arquivo, nem `Prisma.Decimal`:
 * `costUsd` (Domain: `string`) é passado direto para
 * `prisma.aiInteraction.create()`, que aceita `string` como entrada válida
 * para uma coluna `Decimal` (comportamento padrão do Prisma Client para
 * campos `Decimal` — não é necessário construir um `Prisma.Decimal`
 * explicitamente só para escrever). Isso mantém este arquivo — igual a todo
 * repositório Prisma já escrito neste projeto — livre de qualquer import de
 * valor de `@prisma/client`, erasado inteiramente pelo `ts-jest` em tempo de
 * transpilação (`isolatedModules: true`), sem nunca disparar
 * `require('@prisma/client')` em runtime nos testes.
 *
 * NOTA DE VERIFICAÇÃO (mesma limitação já registrada para os demais
 * arquivos Prisma deste projeto): depende de `npx prisma generate` (Client)
 * e `npx prisma migrate deploy`/`migrate dev` (tabela) terem rodado.
 */
export class PrismaAiInteractionRepository implements AiInteractionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(interaction: Omit<AiInteraction, 'id' | 'createdAt'>): Promise<string> {
    const created = await this.prisma.aiInteraction.create({
      data: {
        tenantId: interaction.tenantId,
        conversationId: interaction.conversationId,
        messageId: interaction.messageId,
        provider: PROVIDER_TO_PRISMA[interaction.provider],
        model: interaction.model,
        promptVersion: interaction.promptVersion,
        tokensInput: interaction.tokensInput,
        tokensOutput: interaction.tokensOutput,
        costUsd: interaction.costUsd,
        latencyMs: interaction.latencyMs,
        status: STATUS_TO_PRISMA[interaction.status],
        errorMessage: interaction.errorMessage,
        escalationReason: interaction.escalationReason
          ? ESCALATION_REASON_TO_PRISMA[interaction.escalationReason]
          : undefined,
      },
    });

    return created.id;
  }

  /**
   * Achado F2 (aprovado, preparação arquitetural): `update()` simples por
   * `id` — sem nenhum chamador de produção ainda. Não usa `Prisma` como
   * valor (só o método `update()` da instância `PrismaClient` já injetada),
   * mantendo a mesma disciplina de só `import type` deste arquivo.
   */
  async linkMessage(interactionId: string, messageId: string): Promise<void> {
    await this.prisma.aiInteraction.update({
      where: { id: interactionId },
      data: { messageId },
    });
  }

  /**
   * Milestone 3, Bloco 5 (D13 — aditivo). Filtra por AMBOS `tenantId` E
   * `conversationId` (defesa em profundidade, mesmo racional já documentado
   * no port) — uma `conversationId` de outro tenant simplesmente não
   * corresponde a nenhuma linha, devolvendo lista vazia.
   */
  async listByConversation(
    tenantId: string,
    conversationId: string,
    limit: number,
  ): Promise<AiInteraction[]> {
    const rows = await this.prisma.aiInteraction.findMany({
      where: { tenantId, conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rows.map(toDomain);
  }

  /** Milestone 3, Bloco 5 (D13 — aditivo). Cobre o caso em que `conversationId` é omitido na query string do endpoint REST. */
  async listByTenant(tenantId: string, limit: number): Promise<AiInteraction[]> {
    const rows = await this.prisma.aiInteraction.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rows.map(toDomain);
  }

  /** Fase 1, Bloco F1.4 (2026-08-01) — ver docstring do port. */
  async listUnansweredQuestions(tenantId: string, limit: number): Promise<AiInteraction[]> {
    const rows = await this.prisma.aiInteraction.findMany({
      where: {
        tenantId,
        status: 'SUCCESS' as PrismaAiInteractionStatus,
        escalationReason: 'UNKNOWN_ANSWER' as PrismaAiEscalationReason,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rows.map(toDomain);
  }
}
