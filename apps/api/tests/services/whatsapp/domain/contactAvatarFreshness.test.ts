import {
  AVATAR_TTL_MS,
  NO_AVATAR_TTL_MS,
  isContactAvatarStale,
} from '../../../../src/services/whatsapp/domain/policies/contactAvatarFreshness';

/** Bloco B2 (issue #13) — a regra de validade do cache de fotos. */
describe('isContactAvatarStale', () => {
  const now = new Date('2026-09-05T12:00:00.000Z');

  function minus(ms: number): Date {
    return new Date(now.getTime() - ms);
  }

  it('entrada AUSENTE é sempre vencida (nunca foi checada)', () => {
    expect(isContactAvatarStale(undefined, now)).toBe(true);
  });

  it('foto encontrada recentemente está fresca', () => {
    expect(isContactAvatarStale({ avatarUrl: 'https://x/y.jpg', refreshedAt: now }, now)).toBe(
      false,
    );
  });

  it('foto encontrada vence depois de 7 dias', () => {
    const quaseVencida = { avatarUrl: 'https://x/y.jpg', refreshedAt: minus(AVATAR_TTL_MS - 1) };
    const vencida = { avatarUrl: 'https://x/y.jpg', refreshedAt: minus(AVATAR_TTL_MS) };
    expect(isContactAvatarStale(quaseVencida, now)).toBe(false);
    expect(isContactAvatarStale(vencida, now)).toBe(true);
  });

  it('"sem foto" vence MUITO antes de uma foto encontrada (pode ter sido só um timeout)', () => {
    // O mesmo tempo que deixa uma foto encontrada fresquíssima já basta para
    // reconsultar um "sem foto" — é o meio-termo entre o bug de 2026-07-30
    // (cacheava "sem foto" para sempre) e o bombardeio da ADR #78.
    const idade = NO_AVATAR_TTL_MS;
    expect(isContactAvatarStale({ refreshedAt: minus(idade) }, now)).toBe(true);
    expect(isContactAvatarStale({ avatarUrl: 'https://x/y.jpg', refreshedAt: minus(idade) }, now)).toBe(
      false,
    );
  });

  it('"sem foto" recente ainda está fresco (não reconsulta a cada abertura de tela)', () => {
    expect(isContactAvatarStale({ refreshedAt: minus(NO_AVATAR_TTL_MS - 1) }, now)).toBe(false);
  });
});
