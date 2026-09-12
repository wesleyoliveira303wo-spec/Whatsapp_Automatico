import {
  RefreshTokenService,
  REUSE_GRACE_MS,
} from '../../../../src/services/auth/application/RefreshTokenService';
import { Sha256RefreshTokenCodec } from '../../../../src/services/auth/infrastructure/Sha256RefreshTokenCodec';
import { FakeRefreshTokenRepository } from '../testDoubles';

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function build(
  now: () => Date = () => new Date(),
  graceMs: number = REUSE_GRACE_MS,
): {
  service: RefreshTokenService;
  repo: FakeRefreshTokenRepository;
} {
  const repo = new FakeRefreshTokenRepository();
  const service = new RefreshTokenService(repo, new Sha256RefreshTokenCodec(), TTL_MS, now, graceMs);
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

  it('rotate de um token JA revogado FORA da janela de graça -> reuse_detected + revoga a familia inteira do usuario', async () => {
    let now = new Date('2026-09-12T12:00:00Z');
    const { service, repo } = build(() => now);
    const token1 = await service.issue('user-1');
    await service.issue('user-1'); // um segundo token ativo do mesmo usuario
    await service.rotate(token1); // revoga token1, emite token3

    // Reapresenta o token1 (já revogado) bem DEPOIS da janela de graça —
    // não é mais uma corrida concorrente plausível, e sim reuso de verdade.
    now = new Date(now.getTime() + REUSE_GRACE_MS + 1000);
    const result = await service.rotate(token1);

    expect(result).toEqual({ ok: false, reason: 'reuse_detected' });
    // TODOS os tokens do usuario ficam revogados (familia inteira).
    const active = repo.all().filter((t) => t.revokedAt === undefined);
    expect(active).toHaveLength(0);
  });

  // 2026-09-12 — achado real de produção (ver docstring de `RefreshTokenService`):
  // três revogações em massa no mesmo dia, cada uma um token novo derrubado
  // ~200ms–2,3s depois de emitido — a assinatura de duas requisições do
  // Dashboard usando o MESMO refresh token quase ao mesmo tempo, não de um
  // token roubado. A tolerância existe exatamente para este caso.
  describe('janela de tolerância a reuso CONCORRENTE (2026-09-12)', () => {
    it('reapresentar o token JÁ revogado DENTRO da janela de graça devolve o MESMO token novo — não é reuse_detected, ninguém é revogado', async () => {
      let now = new Date('2026-09-12T12:00:00Z');
      const { service, repo } = build(() => now);
      const token1 = await service.issue('user-1');
      const first = await service.rotate(token1);
      expect(first.ok).toBe(true);

      // Uma segunda requisição concorrente chega com o MESMO token1 antes de
      // a janela de graça fechar.
      now = new Date(now.getTime() + REUSE_GRACE_MS - 1);
      const second = await service.rotate(token1);

      expect(second).toEqual(first);
      // Nada foi revogado por causa desta segunda tentativa — só o token1
      // original (da primeira rotação legítima) está inativo.
      const active = repo.all().filter((t) => t.revokedAt === undefined);
      expect(active).toHaveLength(1);
    });

    it('três tentativas concorrentes com o MESMO token revogado dentro da janela devolvem TODAS o mesmo token novo', async () => {
      const { service } = build();
      const token1 = await service.issue('user-1');
      const first = await service.rotate(token1);

      const [second, third] = await Promise.all([service.rotate(token1), service.rotate(token1)]);

      expect(second).toEqual(first);
      expect(third).toEqual(first);
    });

    it('sem nenhuma rotação registrada para o hash (processo reiniciado no meio) — continua reuse_detected mesmo dentro do que seria a janela', async () => {
      const { service, repo } = build();
      const token1 = await service.issue('user-1');
      // Revoga direto no repositório, sem passar por `rotate()` — não sobra
      // NENHUM registro de "para onde este token foi rotacionado".
      const [record] = repo.all();
      await repo.revokeById(record.id);

      const result = await service.rotate(token1);

      expect(result).toEqual({ ok: false, reason: 'reuse_detected' });
    });
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
