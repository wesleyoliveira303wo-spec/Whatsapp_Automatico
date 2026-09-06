import { createHmac } from 'crypto';

import { Hs256SupportAccessTokenService } from '../../../../src/services/platform/infrastructure/Hs256SupportAccessTokenService';

const SECRET = 'segredo-de-suporte-bem-comprido-1234567890';
const CLAIMS = { supportAccessId: 'sa-1', tenantId: 't-1', platformUserId: 'admin-1' };

describe('Hs256SupportAccessTokenService', () => {
  it('issue → verify devolve os mesmos claims', () => {
    const svc = new Hs256SupportAccessTokenService(SECRET, 7200);
    const token = svc.issue(CLAIMS);
    expect(svc.verify(token)).toEqual(CLAIMS);
  });

  it('token expirado → null', () => {
    let now = 1_000_000;
    const svc = new Hs256SupportAccessTokenService(SECRET, 10, () => now);
    const token = svc.issue(CLAIMS);
    now += 11;
    expect(svc.verify(token)).toBeNull();
  });

  it('assinatura adulterada → null', () => {
    const svc = new Hs256SupportAccessTokenService(SECRET, 7200);
    const token = svc.issue(CLAIMS);
    const [h, p] = token.split('.');
    expect(svc.verify(`${h}.${p}.assinatura-falsa`)).toBeNull();
  });

  it('segredo diferente → null (um crachá não vale no outro plano)', () => {
    const issuer = new Hs256SupportAccessTokenService(SECRET, 7200);
    const other = new Hs256SupportAccessTokenService('outro-segredo-completamente-diferente', 7200);
    expect(other.verify(issuer.issue(CLAIMS))).toBeNull();
  });

  it('confusão de algoritmo (alg="none") → null', () => {
    const svc = new Hs256SupportAccessTokenService(SECRET, 7200);
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ ...CLAIMS, exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString('base64url');
    const sig = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
    expect(svc.verify(`${header}.${payload}.${sig}`)).toBeNull();
  });

  it('claims incompletos → null', () => {
    const svc = new Hs256SupportAccessTokenService(SECRET, 7200);
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ supportAccessId: 'sa-1', exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString('base64url');
    const sig = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
    expect(svc.verify(`${header}.${payload}.${sig}`)).toBeNull();
  });

  it('construtor rejeita segredo vazio / ttl inválido', () => {
    expect(() => new Hs256SupportAccessTokenService('', 100)).toThrow();
    expect(() => new Hs256SupportAccessTokenService(SECRET, 0)).toThrow();
  });
});
