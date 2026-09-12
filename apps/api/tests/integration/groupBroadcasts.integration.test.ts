import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { PrismaGroupBroadcastRepository } from '../../src/services/groupBroadcasts/infrastructure/repositories/PrismaGroupBroadcastRepository';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Teto de tempo próprio para testes contra infraestrutura REAL — mesmo
 * racional documentado em `campaignMedia.integration.test.ts` (medido: o
 * `beforeAll` leva ~5s só para subir o motor do Prisma no Jest/Windows,
 * oscilando em cima do teto padrão de 5s).
 */
jest.setTimeout(30_000);

/**
 * Disparos em grupos (2026-09-11) — contra Postgres REAL. Um Fake em memória
 * nunca provaria três coisas que só importam contra o schema/driver de
 * verdade:
 *
 * 1. Que a mídia (`bytea`, até 16MB de vídeo) sobrevive ao round-trip sem
 *    corromper, e que `GROUP_BROADCAST_SELECT` de fato EXCLUI o binário de
 *    `create`/`findById`/`listBySession` (mesmo risco/mesma prova de
 *    `campaignMedia.integration.test.ts`, Bloco L8).
 * 2. Que a constraint `@@unique([broadcastId, groupJid])` existe de verdade —
 *    `createTargets` usa `skipDuplicates: true`, e só o banco prova que a
 *    duplicata é de fato descartada, não duplicada silenciosamente.
 * 3. Que `onDelete: Cascade` limpa `group_broadcast_targets` ao apagar o
 *    `GroupBroadcast` (e ao apagar o `Tenant`) — nenhum registro órfão.
 *
 * Pula (não falha) se o Postgres não estiver de pé.
 */
describe('Integração real — Disparos em grupos (2026-09-11)', () => {
  let prisma: PrismaClient;
  let repository: PrismaGroupBroadcastRepository;
  let databaseAvailable = true;
  const tenantId = `test-tenant-group-broadcast-${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.tenant.create({ data: { id: tenantId, name: 'Tenant de teste — Disparos em grupos' } });
    } catch {
      databaseAvailable = false;
    }
    repository = new PrismaGroupBroadcastRepository(prisma);
  });

  afterAll(async () => {
    if (databaseAvailable) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  it('cria o disparo + alvos, resume por status e lista por sessão', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Disparo de teste',
      messageTemplate: 'Promoção!',
      intervalSeconds: 60,
    });
    await repository.createTargets(tenantId, broadcast.id, [
      { groupJid: '111@g.us', groupName: 'Grupo 1', status: 'pending' },
      { groupJid: '222@g.us', groupName: 'Grupo 2 (só admin)', status: 'skipped', skipReason: 'admin_only_group' },
    ]);

    const summary = await repository.summarizeTargets(tenantId, broadcast.id);
    expect(summary).toEqual({ total: 2, pending: 1, sent: 0, failed: 0, skipped: 1 });

    const targets = await repository.listTargets(tenantId, broadcast.id);
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.groupJid).sort()).toEqual(['111@g.us', '222@g.us']);

    const bySession = await repository.listBySession(tenantId, 'sessao-integracao', 10);
    expect(bySession.some((b) => b.id === broadcast.id)).toBe(true);
  });

  it('o mesmo grupo não entra duas vezes no mesmo disparo — @@unique via skipDuplicates', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Disparo duplicata',
      messageTemplate: 'Oi',
      intervalSeconds: 60,
    });
    await repository.createTargets(tenantId, broadcast.id, [
      { groupJid: '333@g.us', groupName: 'Grupo 3', status: 'pending' },
    ]);
    // Segunda chamada com o MESMO groupJid — a constraint do banco garante
    // que não vira uma segunda linha (skipDuplicates depende dela existir).
    await repository.createTargets(tenantId, broadcast.id, [
      { groupJid: '333@g.us', groupName: 'Grupo 3 (renomeado)', status: 'pending' },
    ]);

    const targets = await repository.listTargets(tenantId, broadcast.id);
    expect(targets).toHaveLength(1);
    expect(targets[0].groupName).toBe('Grupo 3'); // a primeira linha, nunca sobrescrita.
  });

  it('attachMedia grava o binário; getMediaContent devolve o MESMO Buffer, byte a byte', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Disparo com mídia',
      messageTemplate: 'Confira!',
      intervalSeconds: 60,
    });
    const originalBuffer = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02, 0x03, 0xfe, 0xfd]);

    const updated = await repository.attachMedia(tenantId, broadcast.id, {
      contentType: 'image',
      buffer: originalBuffer,
      mimeType: 'image/jpeg',
      fileName: 'promo.jpg',
    });

    expect(updated?.media).toEqual({ contentType: 'image', mimeType: 'image/jpeg', fileName: 'promo.jpg' });

    const media = await repository.getMediaContent(tenantId, broadcast.id);
    expect(media?.buffer).toBeInstanceOf(Buffer);
    expect(media?.buffer.equals(originalBuffer)).toBe(true);
  });

  it('findById/listBySession NUNCA incluem o binário — só os metadados de media', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Disparo para checar vazamento de binário',
      messageTemplate: 'Oi',
      intervalSeconds: 60,
    });
    const largeBuffer = Buffer.alloc(2 * 1024 * 1024, 1);
    await repository.attachMedia(tenantId, broadcast.id, {
      contentType: 'video',
      buffer: largeBuffer,
      mimeType: 'video/mp4',
    });

    const found = await repository.findById(tenantId, broadcast.id);
    expect(found?.media).toEqual({ contentType: 'video', mimeType: 'video/mp4', fileName: undefined });
    expect(Object.keys(found ?? {})).not.toContain('mediaContent');

    const list = await repository.listBySession(tenantId, 'sessao-integracao', 50);
    const listed = list.find((b) => b.id === broadcast.id);
    expect(listed?.media).toEqual({ contentType: 'video', mimeType: 'video/mp4', fileName: undefined });
    expect(Object.keys(listed ?? {})).not.toContain('mediaContent');
  });

  it('removeMedia limpa as quatro colunas', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Disparo para remover mídia',
      messageTemplate: 'Oi',
      intervalSeconds: 60,
    });
    await repository.attachMedia(tenantId, broadcast.id, {
      contentType: 'image',
      buffer: Buffer.from('bytes'),
      mimeType: 'image/png',
    });

    const updated = await repository.removeMedia(tenantId, broadcast.id);

    expect(updated?.media).toBeUndefined();
    const media = await repository.getMediaContent(tenantId, broadcast.id);
    expect(media).toBeUndefined();
  });

  it('updateStatus só grava pausedReason numa pausa — retomar/cancelar/concluir limpam o anterior', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Disparo de status',
      messageTemplate: 'Oi',
      intervalSeconds: 60,
    });

    await repository.updateStatus(tenantId, broadcast.id, 'paused', 'consecutive_failures');
    let found = await repository.findById(tenantId, broadcast.id);
    expect(found?.status).toBe('paused');
    expect(found?.pausedReason).toBe('consecutive_failures');

    await repository.updateStatus(tenantId, broadcast.id, 'running');
    found = await repository.findById(tenantId, broadcast.id);
    expect(found?.status).toBe('running');
    expect(found?.pausedReason).toBeUndefined();
  });

  it('countRunningBySession conta só RUNNING desta sessão, e ignora o id excluído', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const sessionName = `sessao-running-${Date.now()}`;
    const a = await repository.create({
      tenantId,
      sessionName,
      name: 'A',
      messageTemplate: 'Oi',
      intervalSeconds: 60,
    });
    const b = await repository.create({
      tenantId,
      sessionName,
      name: 'B',
      messageTemplate: 'Oi',
      intervalSeconds: 60,
    });
    await repository.updateStatus(tenantId, a.id, 'running');
    await repository.updateStatus(tenantId, b.id, 'running');

    expect(await repository.countRunningBySession(tenantId, sessionName)).toBe(2);
    expect(await repository.countRunningBySession(tenantId, sessionName, a.id)).toBe(1);
  });

  it('deleteById apaga o disparo E seus alvos (onDelete: Cascade) — nenhum órfão', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Disparo para apagar',
      messageTemplate: 'Oi',
      intervalSeconds: 60,
    });
    await repository.createTargets(tenantId, broadcast.id, [
      { groupJid: '999@g.us', groupName: 'Grupo 9', status: 'pending' },
    ]);

    const deleted = await repository.deleteById(tenantId, broadcast.id);
    expect(deleted).toBe(true);

    expect(await repository.findById(tenantId, broadcast.id)).toBeUndefined();
    const orphanTargets = await prisma.groupBroadcastTarget.findMany({
      where: { broadcastId: broadcast.id },
    });
    expect(orphanTargets).toHaveLength(0);
  });

  it('summarizeTargetsForBroadcasts resume vários disparos numa única consulta', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const a = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Disparo A',
      messageTemplate: 'Oi',
      intervalSeconds: 60,
    });
    const b = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Disparo B',
      messageTemplate: 'Oi',
      intervalSeconds: 60,
    });
    await repository.createTargets(tenantId, a.id, [
      { groupJid: 'a1@g.us', groupName: 'A1', status: 'pending' },
    ]);
    await repository.createTargets(tenantId, b.id, [
      { groupJid: 'b1@g.us', groupName: 'B1', status: 'skipped', skipReason: 'group_not_found' },
    ]);

    const summaries = await repository.summarizeTargetsForBroadcasts(tenantId, [a.id, b.id]);

    expect(summaries.get(a.id)).toEqual({ total: 1, pending: 1, sent: 0, failed: 0, skipped: 0 });
    expect(summaries.get(b.id)).toEqual({ total: 1, pending: 0, sent: 0, failed: 0, skipped: 1 });
  });

  it('markTargetSent/markTargetFailed só agem sobre alvo ainda pending (idempotência)', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Disparo de idempotência',
      messageTemplate: 'Oi',
      intervalSeconds: 60,
    });
    await repository.createTargets(tenantId, broadcast.id, [
      { groupJid: 'idem@g.us', groupName: 'Idem', status: 'pending' },
    ]);
    const [target] = await repository.listTargets(tenantId, broadcast.id);

    const firstAttempt = new Date();
    await repository.markTargetSent(tenantId, target.id, firstAttempt);
    // Repetição — um job repetido nunca reescreve o resultado.
    await repository.markTargetFailed(tenantId, target.id, new Date(), 'não deveria aplicar');

    const found = await repository.findTargetById(tenantId, target.id);
    expect(found?.status).toBe('sent');
    expect(found?.errorMessage).toBeUndefined();
  });
});
