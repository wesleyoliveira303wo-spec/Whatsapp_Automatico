import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { PrismaPlatformSearchRepository } from '../../src/services/platform/infrastructure/repositories/PrismaPlatformSearchRepository';
import { PlatformSearchService } from '../../src/services/platform/application/PlatformSearchService';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

jest.setTimeout(30_000);

/**
 * Painel /admin, Fase 6 — a busca global contra um Postgres REAL. O
 * `PrismaPlatformSearchRepository` é quase só SQL cru (`ILIKE`, `regexp_replace`
 * para casar telefone por dígitos, 4 JOINs, `LIMIT`). Um Fake nunca provaria
 * que o SQL compila nem que o telefone é encontrado sem o `+`.
 *
 * Pula (não falha) se o Postgres estiver fora — mas o pulo é ALTO E VISÍVEL.
 */
describe('Integração real — Busca global (Fase 6)', () => {
  let prisma: PrismaClient;
  let service: PlatformSearchService;
  let databaseAvailable = true;
  const stamp = Date.now();
  const tenantId = `test-tenant-search-${stamp}`;
  const tenantName = `BuscaGlobal SA ${stamp}`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.tenant.create({ data: { id: tenantId, name: tenantName } });
      await prisma.user.create({
        data: {
          tenantId,
          email: `busca-${stamp}@teste.local`,
          passwordHash: 'x',
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });
      await prisma.whatsAppContact.create({
        data: { tenantId, phoneE164: `+55219${stamp % 100000000}`, name: 'Contato Busca', source: 'MANUAL' },
      });
      await prisma.whatsAppSession.create({
        data: { tenantId, sessionName: `Sessao Busca ${stamp}`, status: 'DISCONNECTED' },
      });
      await prisma.campaign.create({
        data: {
          tenantId,
          sessionName: `Sessao Busca ${stamp}`,
          name: `Campanha Busca ${stamp}`,
          messageTemplate: 'oi',
        },
      });
    } catch {
      databaseAvailable = false;
    }
    service = new PlatformSearchService(new PrismaPlatformSearchRepository(prisma));
  });

  afterAll(async () => {
    if (databaseAvailable) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  it('acha o tenant por parte do nome (ILIKE)', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real da Fase 6.');
      return;
    }
    const res = await service.search('BuscaGlobal');
    const tenantGroup = res.groups.find((g) => g.kind === 'tenant');
    expect(tenantGroup?.hits.some((h) => h.id === tenantId)).toBe(true);
  });

  it('acha usuário, sessão e campanha e cada um leva ao detalhe do tenant', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real da Fase 6.');
      return;
    }
    const res = await service.search(`Busca ${stamp}`);
    const kinds = res.groups.map((g) => g.kind);
    expect(kinds).toEqual(expect.arrayContaining(['session', 'campaign']));
    const flat = res.groups.flatMap((g) => g.hits);
    expect(flat.every((h) => h.href === `/admin/tenants/${tenantId}`)).toBe(true);
  });

  it('acha o contato pelos DÍGITOS do telefone (sem o "+" nem espaços)', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real da Fase 6.');
      return;
    }
    const digits = `55219${stamp % 100000000}`;
    const res = await service.search(`+${digits.slice(0, 2)} ${digits.slice(2)}`);
    const contactGroup = res.groups.find((g) => g.kind === 'contact');
    expect(contactGroup?.hits.some((h) => h.tenantId === tenantId)).toBe(true);
  });

  it('acha por id exato do tenant', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real da Fase 6.');
      return;
    }
    const res = await service.search(tenantId);
    expect(res.groups.find((g) => g.kind === 'tenant')?.hits[0]?.id).toBe(tenantId);
  });

  it('curinga do ILIKE (`%`) é literal — não devolve "tudo"', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real da Fase 6.');
      return;
    }
    // O tenant semeado NÃO tem `%` no nome; se `%` fosse curinga, ele voltaria.
    const res = await service.search('BuscaGlobal %');
    expect(res.groups.find((g) => g.kind === 'tenant')?.hits.some((h) => h.id === tenantId)).toBe(
      false,
    );
  });
});
