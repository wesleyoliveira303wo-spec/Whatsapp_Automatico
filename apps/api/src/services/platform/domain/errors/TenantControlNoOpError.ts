/**
 * Ação de controle (Fase 4) que não muda nada: suspender um tenant já
 * suspenso, reativar um já ativo, ou trocar o plano para o que ele já tem.
 *
 * É um erro, e não um sucesso silencioso, de propósito: a trilha
 * (`PlatformAuditLog`) só deve registrar mudanças REAIS. Um `tenant.suspended`
 * gravado quando nada mudou mentiria para quem for ler a trilha depois.
 * Traduzido para 409 pelo error handler.
 */
export class TenantControlNoOpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantControlNoOpError';
  }
}
