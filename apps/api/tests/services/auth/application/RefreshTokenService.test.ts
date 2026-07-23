import { RefreshTokenService } from '../../../../src/services/auth/application/RefreshTokenService';
import { Sha256RefreshTokenCodec } from '../../../../src/services/auth/infrastructure/Sha256RefreshTokenCodec';
import { FakeRefreshTokenRepository } from '../testDoubles';

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function build(now: () => Date = () => new Date()): { service: RefreshTokenService; repo: FakeRefreshTokenRepository } {
  const repo = new FakeRefreshTokenRepository();
  const service = new RefreshTokenService(repo, new Sha256RefreshTokenCodec(), TTL_MS, now);
  return { service, repo };
}

describe('RefreshTokenService (Milestone 5, Bloco M5B)', () => {
  it('issue devolve o token cru e guarda apenas o HASH (nunca o valor cru) no repositorio', async () => {
    const { service, repo } = build();
    const token = await service.issue('user-1');

    const stored = repo.all();
    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).not.toBe(token); // guardou o hash, nao o cru
    expect(stored[0].userId).toBe('user-1');
    expect(stored[0].revokedAt).toBeUndefined();
  });

  it('rotate (happy path): revoga o token apresentado e emite um novo', async () => {
    const { service, repo } = build();
    const token1 = await service.issue('user-1');

    const result = await service.rotate(token1);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe('user-1');
      expect(result.token).not.toBe(token1);
    }
    // O token1 agora esta revogado; o token novo esta ativo.
    const active = repo.all().filter((t) => t.revokedAt === undefined);
    expect(active).toHaveLength(1);
  });

  it('rotate com token desconhecido -> not_found', async () => {
    const { service } = build();
    const result = await service.rotate('token-que-nunca-existiu');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('rotate com token expirado -> expired', async () => {
    let now = new Date('2026-07-18T12:00:00Z');
    const { service } = build(() => now);
    const token = await service.issue('user-1');
    now = new Date(now.getTime() + TTL_MS + 1000); // passou da validade
    const result = await service.rotate(token);
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('rotate de um token JA revogado -> reuse_detected + revoga a familia inteira do usuario', async () => {
    const { service, repo } = build();
    const token1 = await service.issue('user-1');
    await service.issue('user-1'); // um segundo token ativo do mesmo usuario
    await service.rotate(token1); // revoga token1, emite token3

    // Alguem reapresenta o token1 (ja revogado) = reuso.
    const result = await service.rotate(token1);

    expect(result).toEqual({ ok: false, reason: 'reuse_detected' });
    // TODOS os tokens do usuario ficam revogados (familia inteira).
    const active = repo.all().filter((t) => t.revokedAt === undefined);
    expect(active).toHaveLength(0);
  });

  it('revoke invalida um token especifico (logout de um dispositivo)', async () => {
    const { service, repo } = build();
    const token = await service.issue('user-1');
    await service.revoke(token);
    expect(repo.all()[0].revokedAt).toBeInstanceOf(Date);
  });

  it('revokeAllForUser invalida todos os tokens ativos do usuario (logout de tudo)', async () => {
    const { service, repo } = build();
    await service.issue('user-1');
    await service.issue('user-1');
    await service.revokeAllForUser('user-1');
    expect(repo.all().every((t) => t.revokedAt !== undefined)).toBe(true);
  });
});
