import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { RegistrationService } from '../../src/services/auth/application/RegistrationService';
import { ScryptPasswordHasher } from '../../src/services/auth/infrastructure/ScryptPasswordHasher';
import { Hs256AccessTokenService } from '../../src/services/auth/infrastructure/Hs256AccessTokenService';
import { RefreshTokenService } from '../../src/services/auth/application/RefreshTokenService';
import { Sha256RefreshTokenCodec } from '../../src/services/auth/infrastructure/Sha256RefreshTokenCodec';
import { PrismaRefreshTokenRepository } from '../../src/services/auth/infrastructure/repositories/PrismaRefreshTokenRepository';
import { PrismaAuditLogRepository } from '../../src/services/auth/infrastructure/repositories/PrismaAuditLogRepository';
import { NoopLogger } from '../../src/shared/infrastructure/logging/NoopLogger';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Fase Auth/Registro (2026-08-26) — o registro Tenant+Owner contra um
 * Postgres REAL. Por que não basta um Fake: a garantia central deste bloco
 * (registro ATOMICO — tenant nunca fica orfao se o e-mail ja existir) so e
 * real se a constraint `users_email_key` (unicidade GLOBAL) e a transacao do
 * Postgres estiverem em jogo de verdade. Deliberadamente pequeno, mesmo
 * padrao de `contactIdentity.integration.test.ts` — pula (nao falha) se o
 * Postgres nao estiver de pe.
 */
describe('Integração real — registro Tenant+Owner (Fase Auth/Registro)', () => {
  let prisma: PrismaClient;
  let service: RegistrationService;
  let databaseAvailable = true;
  const createdTenantIds: string[] = [];
  const createdEmails: string[] = [];
  const uniqueEmail = (label: string): string =>
    `teste-registro-${label}-${Date.now()}@exemplo.com`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
    } catch {
      databaseAvailable = false;
    }
    const passwordHasher = new ScryptPasswordHasher();
    const accessTokenService = new Hs256AccessTokenService(
      'segredo-teste-registro-1234567890',
      900,
    );
    const refreshTokenService = new RefreshTokenService(
      new PrismaRefreshTokenRepository(prisma),
      new Sha256RefreshTokenCodec(),
      7 * 24 * 60 * 60 * 1000,
    );
    const auditLogRepository = new PrismaAuditLogRepository(prisma);
    service = new RegistrationService(
      prisma,
      passwordHasher,
      accessTokenService,
      refreshTokenService,
      auditLogRepository,
      new NoopLogger(),
    );
  });

  afterAll(async () => {
    if (databaseAvailable) {
      await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
      await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
    }
    await prisma.$disconnect();
  });

  it('cria tenant + owner numa unica operacao e devolve tokens validos', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }
    const email = uniqueEmail('sucesso');
    createdEmails.push(email);

    const result = await service.register({
      name: 'Maria Teste',
      email,
      password: 'senha-forte-123',
      companyName: 'Empresa Teste Ltda',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdTenantIds.push(result.tenantId);

    const tenant = await prisma.tenant.findUnique({ where: { id: result.tenantId } });
    expect(tenant?.name).toBe('Empresa Teste Ltda');

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.role).toBe('OWNER');
    expect(user?.tenantId).toBe(result.tenantId);
    expect(user?.mustChangePassword).toBe(false);
    // Reorganizacao Perfil/Configuracoes (2026-08-27) — o nome informado no
    // registro agora e persistido de verdade (antes so ia para a auditoria).
    expect(user?.name).toBe('Maria Teste');

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  // Auditoria do Perfil (2026-08-28, `PERFIL_REDESIGN_PLAN.md` Fase 1) —
  // achado real: registro ja autentica na hora (emite tokens acima), mas
  // `lastLoginAt` so era gravado em `AuthService.login` por senha. Uma
  // conta que so se registrou e nunca relogou mostraria "ultimo acesso" em
  // branco, apesar de estar ativamente conectada desde o registro.
  it('registro conta como acesso: grava lastLoginAt na hora, nao so no login por senha', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }
    const email = uniqueEmail('ultimo-acesso');
    createdEmails.push(email);
    const registeredAt = new Date('2026-08-28T12:00:00.000Z');

    const passwordHasher = new ScryptPasswordHasher();
    const accessTokenService = new Hs256AccessTokenService('segredo-teste-registro-1234567890', 900);
    const refreshTokenService = new RefreshTokenService(
      new PrismaRefreshTokenRepository(prisma),
      new Sha256RefreshTokenCodec(),
      7 * 24 * 60 * 60 * 1000,
    );
    const serviceWithFixedClock = new RegistrationService(
      prisma,
      passwordHasher,
      accessTokenService,
      refreshTokenService,
      new PrismaAuditLogRepository(prisma),
      new NoopLogger(),
      () => registeredAt,
    );

    const result = await serviceWithFixedClock.register({
      name: 'Ultimo Acesso',
      email,
      password: 'senha-forte-123',
      companyName: 'Empresa Ultimo Acesso',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdTenantIds.push(result.tenantId);

    expect(result.user.lastLoginAt).toEqual(registeredAt);
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.lastLoginAt).toEqual(registeredAt);
  });

  it('e-mail ja em uso -> ok:false, NENHUM tenant novo e criado (atomicidade)', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }
    const email = uniqueEmail('duplicado');
    createdEmails.push(email);

    const first = await service.register({
      name: 'Primeiro',
      email,
      password: 'senha-forte-123',
      companyName: 'Primeira Empresa',
    });
    expect(first.ok).toBe(true);
    if (first.ok) createdTenantIds.push(first.tenantId);

    const tenantCountBefore = await prisma.tenant.count();

    const second = await service.register({
      name: 'Segundo',
      email,
      password: 'outra-senha-123',
      companyName: 'Segunda Empresa',
    });

    expect(second).toEqual({ ok: false, reason: 'email_in_use' });
    const tenantCountAfter = await prisma.tenant.count();
    expect(tenantCountAfter).toBe(tenantCountBefore);
  });

  it('senha fraca (menos de 8 caracteres) -> ok:false, nada e criado', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }
    const email = uniqueEmail('fraca');

    const result = await service.register({
      name: 'Teste',
      email,
      password: '123',
      companyName: 'Empresa Fraca',
    });

    expect(result).toEqual({ ok: false, reason: 'weak_password' });
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeNull();
  });
});
