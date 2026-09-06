import { TenantOverview } from './TenantOverview';

/**
 * Detalhe de UM tenant — Fase 2 (`ADMIN_PLATFORM_MASTER_PLAN.md` §6.2).
 *
 * Estende o `TenantOverview` (todos os indicadores abertos) com o que só faz
 * sentido na tela cheia: as sessões uma a uma, campanhas, contatos e o
 * histórico recente de quedas de conexão.
 *
 * FORA por ora, com motivo: "últimos acessos de suporte" depende de
 * `TenantAccessRequest`, que só nasce na Fase 5. O campo não é declarado aqui
 * para não fingir que existe.
 */
export interface TenantDetail extends TenantOverview {
  sessions: TenantSessionSummary[];
  campaigns: TenantCampaignCounts;
  /** Contatos (`whatsapp_contacts`) do tenant — total. */
  contactCount: number;
  /**
   * Últimas transições de status registradas (`whatsapp_session_events`),
   * da mais recente para a mais antiga, com teto — é o "histórico de quedas"
   * do §6.2, mostrado sem paginação.
   */
  recentSessionEvents: TenantSessionEvent[];
}

export interface TenantSessionSummary {
  sessionName: string;
  /** ⚠️ Última informação conhecida do banco (ADR #80) — ver `TenantOverview`. */
  status: 'connecting' | 'connected' | 'disconnected';
  phoneNumber: string | null;
  lastSeen: Date | null;
  /** O "Cérebro da IA" desta sessão tem conteúdo? */
  aiProfileConfigured: boolean;
}

export interface TenantCampaignCounts {
  total: number;
  running: number;
  paused: number;
  /** Pausada pelo disjuntor de segurança — `status = PAUSED` com `pausedReason`. */
  pausedByBreaker: number;
}

export interface TenantSessionEvent {
  sessionName: string;
  status: 'connecting' | 'connected' | 'disconnected';
  disconnectReason: string | null;
  occurredAt: Date;
}
