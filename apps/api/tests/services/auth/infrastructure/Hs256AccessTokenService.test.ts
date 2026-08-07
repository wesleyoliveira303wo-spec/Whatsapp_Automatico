import { Hs256AccessTokenService } from '../../../../src/services/auth/infrastructure/Hs256AccessTokenService';
import type { AccessTokenClaims } from '../../../../src/services/auth/domain/AccessTokenService';

const SECRET = 'segredo-de-teste-bem-comprido-1234567890';
const CLAIMS: AccessTokenClaims = { userId: 'user-1', tenantId: 'tenant-1', role: 'operator' };

describe('Hs256AccessTokenService (Milestone 5, Bloco M5B)', () => {
  it('construtor recusa secret vazio e ttl invalido', () => {
    expect(() => new Hs256AccessTokenService('', 900)).toThrow();
    expect(() => new Hs256AccessTokenService(SECRET, 0)).toThrow();
    expect(() => new Hs256AccessTokenService(SECRET, -5)).toThrow();
  });

  it('issue + verify: ida e volta devolve os mesmos claims', () => {
    const svc = new Hs256AccessTokenService(SECRET, 900);
    const token = svc.verify(svc.issue(CLAIMS));
    expect(token).toEqual(CLAIMS);
  });

  it('token expirado devolve null (clock injetado avanca no tempo)', () => {
    let now = 1_000_000;
    const svc = new Hs256AccessTokenService(SECRET, 900, () => now);
    const token = svc.issue(CLAIMS);
    now += 901; // passou do ttl de 900s
    expect(svc.verify(token)).toBeNull();
  });

  it('assinatura adulterada (payload trocado) devolve null', () => {
    const svc = new Hs256AccessTokenService(SECRET, 900);
    const token = svc.issue(CLAIMS);
    const [h, , s] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ userId: 'hacker', tenantId: 'tenant-1', role: 'owner', exp: 9999999999 }),
    ).toString('base64url');
    expect(svc.verify(`${h}.${forgedPayload}.${s}`)).toBeNull();
  });

  it('secret diferente nao valida o token (assinatura nao bate)', () => {
    const issuer = new Hs256AccessTokenService(SECRET, 900);
    const attacker = new Hs256AccessTokenService('outro-segredo-completamente-diferente', 900);
    expect(attacker.verify(issuer.issue(CLAIMS))).toBeNull();
  });

  it('alg diferente de HS256 e rejeitado (defesa contra confusao de algoritmo)', () => {
    const svc = new Hs256AccessTokenService(SECRET, 900);
    // Monta um token com header alg:none, assinatura vazia.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ userId: 'u', tenantId: 't', role: 'owner', exp: 9999999999 }),
    ).toString('base64url');
    expect(svc.verify(`${header}.${payload}.`)).toBeNull();
  });

  it('formato invalido (partes faltando/lixo) devolve null', () => {
    const svc = new Hs256AccessTokenService(SECRET, 900);
    expect(svc.verify('sem-pontos')).toBeNull();
    expect(svc.verify('a.b')).toBeNull();
    expect(svc.verify('a.b.c.d')).toBeNull();
  });

  it('role fora do conjunto conhecido e rejeitado mesmo com assinatura valida', () => {
    const svc = new Hs256AccessTokenService(SECRET, 900);
    const token = svc.issue({
      userId: 'u',
      tenantId: 't',
      role: 'inventado' as AccessTokenClaims['role'],
    });
    expect(svc.verify(token)).toBeNull();
  });
});
