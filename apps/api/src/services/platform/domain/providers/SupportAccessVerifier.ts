/**
 * Porta ESTREITA consumida pelo porteiro do produto (`authenticate`, plano
 * `support`) — Painel `/admin`, Fase 5.
 *
 * Vive em `services/platform/domain` mas é chamada de `shared/presentation`:
 * é o único ponto em que o pipeline de auth do tenant depende do painel do
 * dono. Um método só, para o `authenticate` não precisar conhecer o
 * `SupportAccessRepository` inteiro.
 *
 * Regra inviolável 1 (§9.3): "nenhum acesso sem pedido aceito e dentro do
 * prazo — verificado no servidor a cada requisição, nunca só pela validade do
 * cookie". `verify` faz exatamente essa checagem, contra o banco.
 */
export interface SupportAccessVerifier {
  verify(supportAccessId: string): Promise<SupportAccessVerification>;
}

export type SupportAccessVerification =
  | { ok: true; tenantId: string; platformUserId: string }
  | {
      ok: false;
      reason: 'not_found' | 'not_yet_accepted' | 'expired' | 'ended' | 'lookup_failed';
    };
