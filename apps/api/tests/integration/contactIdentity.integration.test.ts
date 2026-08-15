import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { PrismaContactRepository } from '../../src/services/contacts/infrastructure/repositories/PrismaContactRepository';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Fase L, Bloco L1 — a deduplicação de contatos contra um Postgres REAL.
 *
 * Por que este arquivo existe, e não só testes com Fake: a garantia de
 * "um telefone existe no máximo uma vez por tenant" não está na aplicação, e
 * sim na constraint `@@unique([tenantId, phoneE164])` do banco. Um Fake em
 * memória sempre "passaria" nesse teste, provando apenas que o Fake foi
 * escrito de acordo com o que se esperava — nunca que a constraint existe.
 *
 * Deliberadamente pequeno, mesmo espírito de `postgresRealDb.integration.test.ts`:
 * só os pontos que exigem banco de verdade. Pula (não falha) se o Postgres não
 * estiver de pé, para não quebrar a suíte de quem roda sem infraestrutura.
 */
describe('Integração real — identidade de contato (Fase L, Bloco L1)', () => {
  let prisma: PrismaClient;
  let repository: PrismaContactRepository;
  let databaseAvailable = true;
  const tenantId = `test-tenant-contacts-${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.tenant.create({ data: { id: tenantId, name: 'Tenant de teste L1' } });
    } catch {
      databaseAvailable = false;
    }
    repository = new PrismaContactRepository(prisma);
  });

  afterAll(async () => {
    if (databaseAvailable) {
      // Cascade limpa os contatos junto com o tenant.
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  it('o mesmo telefone chamado duas vezes devolve o MESMO contato, não cria duplicata', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const primeiro = await repository.findOrCreateByPhone({
      tenantId,
      phoneE164: '5521988887777',
      source: 'whatsapp',
    });
    const segundo = await repository.findOrCreateByPhone({
      tenantId,
      phoneE164: '5521988887777',
      source: 'whatsapp',
    });

    expect(segundo.id).toBe(primeiro.id);

    const total = await prisma.whatsAppContact.count({
      where: { tenantId, phoneE164: '5521988887777' },
    });
    expect(total).toBe(1);
  });

  // A regra que protege o trabalho do operador: quem deu nome ao lead foi uma
  // pessoa, e uma mensagem recebida depois não pode desfazer isso.
  it('um contato já cadastrado NÃO tem nome nem origem sobrescritos por uma criação automática', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    await repository.findOrCreateByPhone({
      tenantId,
      phoneE164: '5521977776666',
      name: 'Maria da Padaria',
      source: 'import',
    });

    // Simula a pessoa mandando mensagem depois de ter sido importada.
    const depois = await repository.findOrCreateByPhone({
      tenantId,
      phoneE164: '5521977776666',
      source: 'whatsapp',
    });

    expect(depois.name).toBe('Maria da Padaria');
    expect(depois.source).toBe('import');
  });

  it('o mesmo telefone em tenants diferentes são contatos diferentes (isolamento)', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const outroTenantId = `${tenantId}-outro`;
    await prisma.tenant.create({ data: { id: outroTenantId, name: 'Outro tenant de teste L1' } });

    try {
      const deA = await repository.findOrCreateByPhone({
        tenantId,
        phoneE164: '5521911112222',
        source: 'whatsapp',
      });
      const deB = await repository.findOrCreateByPhone({
        tenantId: outroTenantId,
        phoneE164: '5521911112222',
        source: 'whatsapp',
      });

      expect(deB.id).not.toBe(deA.id);
      // E um tenant não enxerga o contato do outro.
      expect(await repository.findById(tenantId, deB.id)).toBeUndefined();
    } finally {
      await prisma.tenant.deleteMany({ where: { id: outroTenantId } });
    }
  });

  it('apagar um contato NÃO apaga a conversa — o histórico é o dado mais caro', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const contato = await repository.findOrCreateByPhone({
      tenantId,
      phoneE164: '5521933334444',
      source: 'whatsapp',
    });
    const conversa = await prisma.whatsAppConversation.create({
      data: {
        tenantId,
        sessionName: 'integration-test-l1',
        contactJid: '5521933334444@s.whatsapp.net',
        contactId: contato.id,
      },
    });

    await prisma.whatsAppContact.delete({ where: { id: contato.id } });

    const sobreviveu = await prisma.whatsAppConversation.findUnique({
      where: { id: conversa.id },
    });
    expect(sobreviveu).not.toBeNull();
    // `onDelete: SetNull` — a conversa perde o vínculo, nunca a existência.
    expect(sobreviveu?.contactId).toBeNull();
  });
});
