/**
 * Porta ESTREITA para `services/conversations` acionar o opt-out automático
 * por palavra-chave (`services/contacts`) sem conhecer aquele bounded
 * context — Fase L, Bloco L2. Mesmo padrão e mesmo motivo de
 * `ContactResolver`/`AiAvailabilityRepository`.
 *
 * A implementação decide, sozinha, se `content` é um comando de opt-out
 * reconhecido (ver `isOptOutKeyword`, Domain de `services/contacts`); se
 * for, marca o contato e registra o evento de consentimento. Se não for,
 * não faz nada. `MessageIngestionService` não precisa saber a regra — só
 * que, para toda mensagem inbound com contato resolvido, existe a chance de
 * ela ser um pedido de saída.
 */
export interface OptOutDetector {
  /**
   * NUNCA LANÇA — mesmo contrato de `ContactResolver.resolveByWhatsAppJid`.
   * Detecção/registro de opt-out é auxiliar: uma falha aqui jamais pode
   * impedir a mensagem de ser recebida e respondida.
   */
  detectAndRecord(tenantId: string, contactId: string, content: string): Promise<void>;
}
