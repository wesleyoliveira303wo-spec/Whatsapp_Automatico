import { Hs256PlatformSessionTokenService } from '../../../../src/services/platform/infrastructure/Hs256PlatformSessionTokenService';
import { Hs256AccessTokenService } from '../../../../src/services/auth/infrastructure/Hs256AccessTokenService';

const SECRET = 'segredo-da-plataforma';

function build(nowSeconds = () => 1_000): Hs256PlatformSessionTokenService {
  return new Hs256PlatformSessionTokenService(SECRET, 60, nowSeconds);
}

describe('Hs256PlatformSessionTokenService', () => {
  it('emite e confere um crachá válido', () => {
    const service = build();

    const claims = service.verify(service.issue({ platformUserId: 'admin-1' }));

    expect(claims).toEqual({ platformUserId: 'admin-1' });
  });

  it('recusa crachá assinado com outro segredo', () => {
    const outro = new Hs256PlatformSessionTokenService('outro-segredo', 60, () => 1_000);

    expect(build().verify(outro.issue({ platformUserId: 'admin-1' }))).toBeNull();
  });

  it('recusa crachá expirado', () => {
    let now = 1_000;
    const service = build(() => now);
    const token = service.issue({ platformUserId: 'admin-1' });

    now = 1_061;

    expect(service.verify(token)).toBeNull();
  });

  it('recusa algoritmo trocado — inclusive `none` (confusão de algoritmo)', () => {
    const service = build();
    const [, payload, signature] = service.issue({ platformUserId: 'admin-1' }).split('.');
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');

    expect(service.verify(`${header}.${payload}.${signature}`)).toBeNull();
  });

  it('recusa payload adulterado (troca de admin)', () => {
    const service = build();
    const [header, , signature] = service.issue({ platformUserId: 'admin-1' }).split('.');
    const forjado = Buffer.from(
      JSON.stringify({ platformUserId: 'outro-admin', iat: 1_000, exp: 1_060 }),
    ).toString('base64url');

    expect(service.verify(`${header}.${forjado}.${signature}`)).toBeNull();
  });

  it('recusa lixo e token com número errado de partes', () => {
    const service = build();

    expect(service.verify('nao-e-um-token')).toBeNull();
    expect(service.verify('a.b')).toBeNull();
    expect(service.verify('a.b.c.d')).toBeNull();
  });

  it('exige segredo e validade coerentes na construção', () => {
    expect(() => new Hs256PlatformSessionTokenService('', 60)).toThrow();
    expect(() => new Hs256PlatformSessionTokenService(SECRET, 0)).toThrow();
  });

  /**
   * A trava central do desenho: os dois porteiros não se aceitam. Mesmo com o
   * MESMO segredo (o pior cenário, que o `index.ts` já recusa), um crachá de
   * tenant não vira crachá de plataforma nem o contrário — os formatos de
   * payload são incompatíveis por construção.
   */
  it('crachá de tenant não passa no porteiro da plataforma, nem vice-versa', () => {
    const plataforma = new Hs256PlatformSessionTokenService(SECRET, 60, () => 1_000);
    const tenant = new Hs256AccessTokenService(SECRET, 60, () => 1_000);

    const crachaDeTenant = tenant.issue({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'owner',
    });
    const crachaDePlataforma = plataforma.issue({ platformUserId: 'admin-1' });

    expect(plataforma.verify(crachaDeTenant)).toBeNull();
    expect(tenant.verify(crachaDePlataforma)).toBeNull();
  });
});
