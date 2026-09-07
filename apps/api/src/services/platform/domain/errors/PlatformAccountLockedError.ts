/**
 * Conta de plataforma trancada por tentativas seguidas (trava do Bloco B1).
 * `retryAfterMs` alimenta o cabeçalho `Retry-After`, mesmo contrato do login
 * de tenant.
 */
export class PlatformAccountLockedError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('Muitas tentativas. Tente de novo mais tarde.');
    this.name = 'PlatformAccountLockedError';
  }
}
