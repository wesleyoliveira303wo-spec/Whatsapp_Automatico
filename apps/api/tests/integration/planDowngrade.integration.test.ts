import path from 'path';
import { randomBytes } from 'crypto';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { WhatsAppSessionService } from '../../src/services/whatsapp/application/WhatsAppSessionService';
import { WhatsAppConnectionRegistry } from '../../src/services/whatsapp/application/WhatsAppConnectionRegistry';
import { PrismaWhatsAppSessionRepository } from '../../src/services/whatsapp/infrastructure/repositories/PrismaWhatsAppSessionRepository';
import { PrismaWhatsAppSessionEventRepository } from '../../src/services/whatsapp/infrastructure/repositories/PrismaWhatsAppSessionEventRepository';
import { PrismaCredentialsStore } from '../../src/shared/security/infrastructure/PrismaCredentialsStore';
import { AesGcmCipher } from '../../src/shared/security/infrastructure/AesGcmCipher';
import { buildWhatsAppCredentialsNamespace } from '../../src/services/whatsapp/domain/credentialsNamespace';
import { PrismaTenantRepository } from '../../src/shared/tenant/infrastructure/PrismaTenantRepository';
import { PrismaAuditLogRepository } from '../../src/services/auth/infrastructure/repositories/PrismaAuditLogRepository';
import { NoopLogger } from '../../src/shared/infrastructure/logging/NoopLogger';
import { FakeWhatsAppProviderFactory } from '../services/whatsapp/infrastructure/FakeWhatsAppProviderFactory';
import { CampaignService } from '../../src/services/campaigns/application/CampaignService';
import { PrismaCampaignRepository } from '../../src/services/campaigns/infrastructure/repositories/PrismaCampaignRepository';
import { GroupBroadcastService } from '../../src/services/groupBroadcasts/application/GroupBroadcastService';
import { PrismaGroupBroadcastRepository } from '../../src/services/groupBroadcasts/infrastructure/repositories/PrismaGroupBroadcastRepository';
import { FakeGroupDirectory } from '../services/groupBroadcasts/fakes';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Teto de tempo próprio para testes contra infraestrutura REAL — mesmo
 * racional já documentado em `campaignMedia.integration.test.ts` (medido: o
 * `beforeAll` leva ~5s só para subir o motor do Prisma no Jest/Windows).
 */
jest.setTimeout(30_000);

/**
 * B5, etapa 3 — descida de plano, contra Postgres REAL. Prova a garantia
 * "nunca apaga histórico" contra o banco de verdade, não um Fake: as três
 * implementações (`WhatsAppSessionService.detachExcessSessions`,
 * `CampaignService.pauseAllRunningForPlanDowngrade`,
 * `GroupBroadcastService.pauseAllRunningForPlanDowngrade`) são chamadas
 * encadeadas manualmente aqui — `PlanChangeService` em si já foi testado com
 * Fakes na Task 1, o que falta provar é que estas três implementações reais
 * fazem exatamente o que prometem contra o schema/driver de verdade.
 *
 * Pula (não falha) se o Postgres não estiver de pé.
 */
describe('Integração real — descida de plano (B5, etapa 3)', () => {
  let prisma: PrismaClient;
  let databaseAvailable = true;
  const tenantId = `test-tenant-plan-downgrade-${Date.now()}`;
  const masterKey = randomBytes(32).toString('base64');

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.tenant.create({
        data: { id: tenantId, name: 'Tenant de teste — descida de plano', plan: 'ENTERPRISE' },
      });
    } catch {
      databaseAvailable = false;
    }
  });

  afterAll(async () => {
    if (databaseAvailable) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  it('sessões excedentes são desconectadas e sem credenciais, sem apagar o registro; campanha e disparo em grupos running viram paused/plan_downgrade', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const logger = new NoopLogger();

    // --- Sessões: 2 com credenciais (ocupam vaga), 1 sem (nunca conectada) ---
    const credentialsStore = new PrismaCredentialsStore(prisma, new AesGcmCipher(masterKey));
    const now = Date.now();
    await prisma.whatsAppSession.create({
      data: {
        tenantId,
        sessionName: 'antiga',
        status: 'DISCONNECTED',
        createdAt: new Date(now - 2 * 60_000),
      },
    });
    await prisma.whatsAppSession.create({
      data: {
        tenantId,
        sessionName: 'nova',
        status: 'DISCONNECTED',
        createdAt: new Date(now - 60_000),
      },
    });
    await prisma.whatsAppSession.create({
      data: { tenantId, sessionName: 'abandonada', status: 'DISCONNECTED', createdAt: new Date(now) },
    });
    await credentialsStore.set(tenantId, buildWhatsAppCredentialsNamespace('antiga'), 'creds', '{}');
    await credentialsStore.set(tenantId, buildWhatsAppCredentialsNamespace('nova'), 'creds', '{}');

    const sessionRepository = new PrismaWhatsAppSessionRepository(prisma);
    const eventRepository = new PrismaWhatsAppSessionEventRepository(prisma);
    const registry = new WhatsAppConnectionRegistry(
      new FakeWhatsAppProviderFactory(),
      sessionRepository,
      logger,
      eventRepository,
    );
    const tenantRepository = new PrismaTenantRepository(prisma);
    const auditLogRepository = new PrismaAuditLogRepository(prisma);
    const sessionService = new WhatsAppSessionService(
      registry,
      tenantRepository,
      logger,
      sessionRepository,
      credentialsStore,
      eventRepository,
      auditLogRepository,
    );

    // --- Campanha e disparo em grupos, ambos running ---
    const campaignRepository = new PrismaCampaignRepository(prisma);
    const campaignService = new CampaignService(campaignRepository, tenantRepository, logger);
    const campaign = await campaignRepository.create({
      tenantId,
      sessionName: 'antiga',
      name: 'Campanha de teste',
      messageTemplate: 'Olá!',
    });
    await campaignRepository.updateCampaignStatus(tenantId, campaign.id, 'running');

    const groupBroadcastRepository = new PrismaGroupBroadcastRepository(prisma);
    const groupBroadcastService = new GroupBroadcastService(
      groupBroadcastRepository,
      tenantRepository,
      new FakeGroupDirectory(),
      logger,
    );
    const broadcast = await groupBroadcastRepository.create({
      tenantId,
      sessionName: 'antiga',
      name: 'Disparo de teste',
      intervalSeconds: 60,
    });
    await groupBroadcastRepository.updateStatus(tenantId, broadcast.id, 'running');

    // --- Aplica a descida (newLimit = 1, como um Enterprise→Pro real) ---
    await sessionService.detachExcessSessions(tenantId, 1);
    const campaignsPaused = await campaignService.pauseAllRunningForPlanDowngrade(tenantId);
    const broadcastsPaused = await groupBroadcastService.pauseAllRunningForPlanDowngrade(tenantId);

    expect(campaignsPaused).toBe(1);
    expect(broadcastsPaused).toBe(1);

    // Sessões: "antiga" (a mais antiga que ocupava vaga) sobrevive; "nova"
    // é desconectada e perde as credenciais; "abandonada" nunca ocupou vaga,
    // então nunca é candidata — nenhuma das três tem o REGISTRO apagado.
    const remaining = await sessionRepository.findAllByTenant(tenantId);
    expect(remaining.map((s) => s.sessionName).sort()).toEqual(['abandonada', 'antiga', 'nova']);
    expect(
      await credentialsStore.get(tenantId, buildWhatsAppCredentialsNamespace('antiga'), 'creds'),
    ).not.toBeNull();
    expect(
      await credentialsStore.get(tenantId, buildWhatsAppCredentialsNamespace('nova'), 'creds'),
    ).toBeNull();

    const campaignRow = await campaignRepository.findById(tenantId, campaign.id);
    expect(campaignRow?.status).toBe('paused');
    expect(campaignRow?.pausedReason).toBe('plan_downgrade');

    const broadcastRow = await groupBroadcastRepository.findById(tenantId, broadcast.id);
    expect(broadcastRow?.status).toBe('paused');
    expect(broadcastRow?.pausedReason).toBe('plan_downgrade');
  });
});
