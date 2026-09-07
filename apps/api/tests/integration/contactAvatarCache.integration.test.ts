import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { PrismaContactAvatarCacheRepository } from '../../src/services/whatsapp/infrastructure/repositories/PrismaContactAvatarCacheRepository';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Teto de tempo próprio para testes que falam com infraestrutura REAL.
 *
 * Medido (2026-09-05), não chutado: o `beforeAll` destes arquivos leva ~5s
 * só para subir o motor de consulta do Prisma dentro do Jest no Windows —
 * ou seja, oscila EXATAMENTE em cima do teto padrão de 5s do Jest. O
 * resultado era uma suíte que passava numa execução e falhava na seguinte
 * sem nenhuma mudança de código, com uma mensagem ("Exceeded timeout ... for
 * a hook") que aponta para o teste em vez de para a causa. O padrão de 5s
 * nunca foi uma afirmação sobre estes testes; é só o default de um teste de
 * unidade.
 */
jest.setTimeout(30_000);


/**
 * Bloco B2 (issue #13) — o cache de fotos de perfil contra um Postgres REAL.
 *
 * Por que precisa de banco de verdade: a peça central do desenho é a
 * distinção entre "linha ausente" (nunca checamos) e "linha presente com URL
 * nula" (checamos e não há foto). Essa distinção depende de a coluna aceitar
 * NULL e de a chave primária composta existir de fato — um Fake em memória
 * sempre passaria, provando só que o Fake foi escrito conforme o esperado.
 *
 * Pula (não falha) se o Postgres não estiver de pé, mesmo padrão dos demais
 * testes de integração deste diretório. ATENÇÃO ao ler o resultado: procure
 * a ausência do aviso de pulo, não só o "passed" (lição registrada no L1).
 */
describe('Integração real — cache de foto de perfil (Bloco B2)', () => {
  let prisma: PrismaClient;
  let repository: PrismaContactAvatarCacheRepository;
  let databaseAvailable = true;
  const tenantId = `test-tenant-avatar-${Date.now()}`;
  const sessionName = 'vendas';

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.tenant.create({ data: { id: tenantId, name: 'Tenant de teste B2' } });
    } catch {
      databaseAvailable = false;
    }
    repository = new PrismaContactAvatarCacheRepository(prisma);
  });

  afterAll(async () => {
    if (databaseAvailable) {
      // A tabela de cache não tem FK para o tenant (é cache derivado), então
      // a limpeza é explícita, não por cascade.
      await prisma.whatsAppContactAvatar.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  function skipIfUnavailable(): boolean {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return true;
    }
    return false;
  }

  it('JID nunca checado simplesmente não aparece no resultado', async () => {
    if (skipIfUnavailable()) return;

    const rows = await repository.findManyByContactJids(tenantId, sessionName, [
      'nunca-checado@s.whatsapp.net',
    ]);

    expect(rows).toEqual([]);
  });

  it('grava e lê uma foto encontrada', async () => {
    if (skipIfUnavailable()) return;
    const jid = 'com-foto@s.whatsapp.net';
    const refreshedAt = new Date('2026-09-05T10:00:00.000Z');

    await repository.upsert(tenantId, sessionName, jid, 'https://cdn/foto.jpg', refreshedAt);
    const [row] = await repository.findManyByContactJids(tenantId, sessionName, [jid]);

    expect(row).toEqual({ contactJid: jid, avatarUrl: 'https://cdn/foto.jpg', refreshedAt });
  });

  it('"sem foto" fica gravado como linha PRESENTE com URL ausente (o registro negativo)', async () => {
    if (skipIfUnavailable()) return;
    const jid = 'sem-foto@s.whatsapp.net';

    await repository.upsert(tenantId, sessionName, jid, undefined, new Date());
    const [row] = await repository.findManyByContactJids(tenantId, sessionName, [jid]);

    // A linha EXISTE — é isso que distingue "checamos e não tem" de "nunca
    // checamos", e é o que impede o contato de ser reconsultado sem parar.
    expect(row).toBeDefined();
    expect(row.avatarUrl).toBeUndefined();
  });

  it('regravar o mesmo contato ATUALIZA a linha, nunca duplica (chave composta)', async () => {
    if (skipIfUnavailable()) return;
    const jid = 'atualizado@s.whatsapp.net';

    await repository.upsert(tenantId, sessionName, jid, undefined, new Date());
    await repository.upsert(tenantId, sessionName, jid, 'https://cdn/nova.jpg', new Date());

    const rows = await repository.findManyByContactJids(tenantId, sessionName, [jid]);
    expect(rows).toHaveLength(1);
    expect(rows[0].avatarUrl).toBe('https://cdn/nova.jpg');
  });

  it('a mesma pessoa em SESSÕES diferentes são entradas independentes', async () => {
    if (skipIfUnavailable()) return;
    const jid = 'multi-sessao@s.whatsapp.net';

    await repository.upsert(tenantId, 'vendas', jid, 'https://cdn/vendas.jpg', new Date());
    await repository.upsert(tenantId, 'suporte', jid, 'https://cdn/suporte.jpg', new Date());

    const [vendas] = await repository.findManyByContactJids(tenantId, 'vendas', [jid]);
    const [suporte] = await repository.findManyByContactJids(tenantId, 'suporte', [jid]);
    expect(vendas.avatarUrl).toBe('https://cdn/vendas.jpg');
    expect(suporte.avatarUrl).toBe('https://cdn/suporte.jpg');

    await prisma.whatsAppContactAvatar.deleteMany({ where: { tenantId, sessionName: 'suporte' } });
  });

  it('lê em LOTE — uma consulta devolve vários contatos de uma vez', async () => {
    if (skipIfUnavailable()) return;
    const jids = ['lote-1@s.whatsapp.net', 'lote-2@s.whatsapp.net', 'lote-3@s.whatsapp.net'];
    for (const jid of jids) {
      await repository.upsert(tenantId, sessionName, jid, `https://cdn/${jid}.jpg`, new Date());
    }

    const rows = await repository.findManyByContactJids(tenantId, sessionName, [
      ...jids,
      'inexistente@s.whatsapp.net',
    ]);

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.contactJid).sort()).toEqual([...jids].sort());
  });

  it('não vaza o cache de OUTRO tenant', async () => {
    if (skipIfUnavailable()) return;
    const jid = 'isolado@s.whatsapp.net';
    await repository.upsert(tenantId, sessionName, jid, 'https://cdn/meu.jpg', new Date());

    const deOutroTenant = await repository.findManyByContactJids(
      'tenant-que-nao-e-o-meu',
      sessionName,
      [jid],
    );

    expect(deOutroTenant).toEqual([]);
  });
});
