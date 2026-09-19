/**
 * Porta estreita para `services/whatsapp` (B5, etapa 3) — `PlanChangeService`
 * nunca importa o domínio de WhatsApp inteiro só para desconectar sessões
 * excedentes na descida de plano (mesmo padrão de `AiAvailabilityRepository`/
 * `ContactResolver`).
 */
export interface SessionDowngradeHandler {
  /**
   * Desconecta e apaga as credenciais das sessões que sobram acima do NOVO
   * limite — as mais antigas (`createdAt`) ficam. Mantém o registro da
   * sessão e todo o histórico; reconectar depois exige QR (e vaga) de novo.
   * Nunca lança: uma falha aqui não pode travar a descida de plano.
   */
  detachExcessSessions(tenantId: string, newLimit: number): Promise<void>;
}
