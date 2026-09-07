/**
 * Ação de controle (Fase 4) pedida para um tenant que não existe — id
 * inválido ou tenant já excluído. Traduzida para 404 pelo router.
 */
export class TenantNotFoundError extends Error {
  constructor(public readonly tenantId: string) {
    super(`Tenant ${tenantId} não encontrado.`);
    this.name = 'TenantNotFoundError';
  }
}
