/**
 * Erro de Domain para quando um `tenantId` é referenciado mas não existe em
 * `TenantRepository` (Production Hardening, Bloco 5). Vive em `shared/tenant`
 * — não em `services/whatsapp/domain` — pelo mesmo motivo de `Tenant`/
 * `TenantRepository`: é um conceito transversal, não específico do bounded
 * context do WhatsApp. Qualquer futuro consumidor de `TenantRepository`
 * (não só `WhatsAppSessionService`) reaproveita este erro sem precisar
 * importar nada do bounded context do WhatsApp.
 *
 * Substitui o uso de `Error` genérico, para que a camada de Presentation
 * (futuro `whatsAppErrorHandler`, Bloco 7) possa mapear este erro para um
 * status HTTP específico pelo nome da classe, e não por comparação de string
 * de mensagem — mesmo padrão já usado em `WhatsAppSessionNotFoundError`.
 */
export class TenantNotFoundError extends Error {
  constructor(tenantId: string) {
    super(`Tenant not found: ${tenantId}`);
    this.name = 'TenantNotFoundError';
  }
}
