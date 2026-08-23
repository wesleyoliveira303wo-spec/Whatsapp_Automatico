import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { PrismaCampaignRepository } from '../../src/services/campaigns/infrastructure/repositories/PrismaCampaignRepository';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Fase L, Bloco L8 — mídia de campanha contra um Postgres REAL. Um Fake
 * nunca provaria duas coisas que só importam contra o schema/driver de
 * verdade:
 *
 * 1. Que o binário (`bytea`) sobrevive ao round-trip Postgres sem corromper
 *    (o driver do `pg`/Prisma devolve `Buffer` para colunas `Bytes`, não
 *    `Uint8Array`/base64 — só um teste real confirma o tipo/conteúdo exatos).
 * 2. Que `CAMPAIGN_SELECT` (o `select` explícito de `findById`/`listByTenant`)
 *    de fato EXCLUI `mediaContent` — o risco real que motivou essa constante:
 *    sem ela, toda resposta de lista/detalhe da API incluiria o binário
 *    inteiro. Um Fake em memória nunca vazaria isso por acidente, então nunca
 *    provaria a ausência.
 *
 * Pula (não falha) se o Postgres não estiver de pé.
 */
describe('Integração real — mídia de campanha (Fase L, Bloco L8)', () => {
  let prisma: PrismaClient;
  let campaignRepository: PrismaCampaignRepository;
  let databaseAvailable = true;
  const tenantId = `test-tenant-campaign-media-${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.tenant.create({ data: { id: tenantId, name: 'Tenant de teste L8' } });
    } catch {
      databaseAvailable = false;
    }
    campaignRepository = new PrismaCampaignRepository(prisma);
  });

  afterAll(async () => {
    if (databaseAvailable) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  it('attachMedia grava o binário; getMediaContent devolve o MESMO Buffer, byte a byte', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const campaign = await campaignRepository.create({
      tenantId,
      sessionName: 'integration-test-l8',
      name: 'Campanha com mídia',
      messageTemplate: 'Confira a novidade!',
    });
    const originalBuffer = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02, 0x03, 0xfe, 0xfd]);

    const updated = await campaignRepository.attachMedia(tenantId, campaign.id, {
      contentType: 'image',
      buffer: originalBuffer,
      mimeType: 'image/jpeg',
      fileName: 'promo.jpg',
    });

    expect(updated?.media).toEqual({
      contentType: 'image',
      mimeType: 'image/jpeg',
      fileName: 'promo.jpg',
    });

    const media = await campaignRepository.getMediaContent(tenantId, campaign.id);
    expect(media?.buffer).toBeInstanceOf(Buffer);
    expect(media?.buffer.equals(originalBuffer)).toBe(true);
    expect(media).toMatchObject({
      contentType: 'image',
      mimeType: 'image/jpeg',
      fileName: 'promo.jpg',
    });
  });

  it('findById() e listByTenant() NUNCA incluem o binário — só os metadados de media', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const campaign = await campaignRepository.create({
      tenantId,
      sessionName: 'integration-test-l8',
      name: 'Campanha para checar vazamento de binário',
      messageTemplate: 'Oi',
    });
    // Um binário GRANDE o bastante para não passar despercebido se vazasse
    // sem querer numa resposta JSON (2MB de zeros).
    const largeBuffer = Buffer.alloc(2 * 1024 * 1024, 1);
    await campaignRepository.attachMedia(tenantId, campaign.id, {
      contentType: 'document',
      buffer: largeBuffer,
      mimeType: 'application/pdf',
    });

    const found = await campaignRepository.findById(tenantId, campaign.id);
    expect(found?.media).toEqual({
      contentType: 'document',
      mimeType: 'application/pdf',
      fileName: undefined,
    });
    // `Campaign` (Domain) nem declara um campo de binário — esta asserção
    // prova que nenhuma propriedade estranha ("mediaContent") vazou do
    // Prisma para o objeto devolvido ao chamador.
    expect(Object.keys(found ?? {})).not.toContain('mediaContent');

    const page = await campaignRepository.listByTenant(tenantId, {
      limit: 10,
      sessionName: 'integration-test-l8',
    });
    const listed = page.campaigns.find((c) => c.id === campaign.id);
    expect(listed?.media).toEqual({
      contentType: 'document',
      mimeType: 'application/pdf',
      fileName: undefined,
    });
    expect(Object.keys(listed ?? {})).not.toContain('mediaContent');
  });

  it('removeMedia limpa as quatro colunas — getMediaContent volta a undefined, findById.media some', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const campaign = await campaignRepository.create({
      tenantId,
      sessionName: 'integration-test-l8',
      name: 'Campanha para remover mídia',
      messageTemplate: 'Oi',
    });
    await campaignRepository.attachMedia(tenantId, campaign.id, {
      contentType: 'video',
      buffer: Buffer.from('bytes-de-video'),
      mimeType: 'video/mp4',
    });

    const updated = await campaignRepository.removeMedia(tenantId, campaign.id);

    expect(updated?.media).toBeUndefined();
    const media = await campaignRepository.getMediaContent(tenantId, campaign.id);
    expect(media).toBeUndefined();
    const found = await campaignRepository.findById(tenantId, campaign.id);
    expect(found?.media).toBeUndefined();
  });

  it('attachMedia SUBSTITUI uma mídia anterior — não acumula, o binário antigo não sobrevive', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const campaign = await campaignRepository.create({
      tenantId,
      sessionName: 'integration-test-l8',
      name: 'Campanha para trocar mídia',
      messageTemplate: 'Oi',
    });
    await campaignRepository.attachMedia(tenantId, campaign.id, {
      contentType: 'image',
      buffer: Buffer.from('primeira-imagem'),
      mimeType: 'image/jpeg',
    });

    await campaignRepository.attachMedia(tenantId, campaign.id, {
      contentType: 'document',
      buffer: Buffer.from('segundo-arquivo'),
      mimeType: 'application/pdf',
      fileName: 'catalogo.pdf',
    });

    const media = await campaignRepository.getMediaContent(tenantId, campaign.id);
    expect(media?.buffer.toString()).toBe('segundo-arquivo');
    expect(media).toMatchObject({
      contentType: 'document',
      mimeType: 'application/pdf',
      fileName: 'catalogo.pdf',
    });
  });

  it('getMediaContent devolve undefined para campanha SEM mídia (nunca lança)', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const campaign = await campaignRepository.create({
      tenantId,
      sessionName: 'integration-test-l8',
      name: 'Campanha sem mídia',
      messageTemplate: 'Oi',
    });

    const media = await campaignRepository.getMediaContent(tenantId, campaign.id);

    expect(media).toBeUndefined();
  });
});
