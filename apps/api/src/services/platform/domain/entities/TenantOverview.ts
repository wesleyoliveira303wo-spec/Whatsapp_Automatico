import { TenantPlan } from '../../../../shared/tenant/domain/TenantPlan';
import { TenantStatus } from '../../../../shared/tenant/domain/TenantStatus';

/**
 * Retrato de UM tenant para o Centro de Tenants do `/admin` — Fase 2
 * (`ADMIN_PLATFORM_MASTER_PLAN.md` §6).
 *
 * É um READ MODEL, não uma entidade de domínio: só existe para a tela do
 * fundador. Cada campo tem uma fonte real no banco (§6.4) — nada aqui é
 * derivado de suposição. O que o banco não sabe (preço do plano em USD, por
 * exemplo) fica fora e é resolvido por constante documentada nos sinais.
 *
 * Todos os agregados (`messages30d`, `ai30d`, ...) são da JANELA de 30 dias,
 * fixada pelo Application Service — o período não é escolhido pelo fundador
 * nesta fase (YAGNI; entra se pedir).
 */
export interface TenantOverview {
  id: string;
  name: string;
  plan: TenantPlan;
  /**
   * Trava de acesso (Fase 4). `'suspended'` = o tenant inteiro não loga. A
   * lista do `/admin` mostra um selo; o detalhe mostra os botões de ação.
   */
  status: TenantStatus;
  createdAt: Date;

  /** Sessões de WhatsApp REGISTRADAS (qualquer status). 0 = nunca instalou. */
  sessionCount: number;
  /**
   * Sessões com status `CONNECTED` NO BANCO. ⚠️ Pode estar velho: o banco só
   * é atualizado enquanto há instância viva da sessão em memória (ADR #80).
   * A sobreposição pelo registry ao vivo é da Fase 3 — aqui é "última
   * informação conhecida", e a UI diz isso.
   */
  connectedSessionCount: number;

  /** Usuários (pessoas) do tenant. */
  userCount: number;

  /**
   * `max(whatsapp_messages.occurred_at)` de TODA a história (não só 30d) —
   * "quando este cliente foi visto pela última vez". `null` = nunca trocou
   * mensagem nenhuma.
   */
  lastActivityAt: Date | null;

  /** Mensagens da janela de 30 dias, por direção. */
  messages30d: {
    inbound: number;
    outbound: number;
  };

  /** Interações de IA da janela de 30 dias. */
  ai30d: {
    total: number;
    success: number;
    providerError: number;
    validationRejected: number;
    /**
     * `sum(ai_interactions.cost_usd)` — STRING decimal exata, nunca
     * `Number()` (D46). "0" no free tier do Gemini.
     */
    costUsd: string;
  };

  /** Conversas da janela de 30 dias — base da taxa de escalonamento. */
  conversations30d: {
    total: number;
    /** Conversas que em algum momento tiveram `escalated_at` preenchido. */
    escalated: number;
  };

  /**
   * O "Cérebro da IA" tem conteúdo em ao menos uma sessão?
   * (`ai_business_profiles.content` não vazio.) Alimenta a leitura de
   * "IA travando" — escalonamento alto com o Cérebro vazio é uma coisa;
   * com o Cérebro cheio é outra.
   */
  aiProfileConfigured: boolean;
}
