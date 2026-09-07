/**
 * Credencial inválida no login do `/admin`.
 *
 * Deliberadamente NÃO distingue "e-mail não existe" de "senha errada": a
 * diferença de resposta viraria um oráculo de quais e-mails são admin da
 * plataforma — o mesmo cuidado já aplicado no login de tenant (Bloco B1).
 */
export class InvalidPlatformCredentialsError extends Error {
  constructor() {
    super('E-mail ou senha inválidos.');
    this.name = 'InvalidPlatformCredentialsError';
  }
}
