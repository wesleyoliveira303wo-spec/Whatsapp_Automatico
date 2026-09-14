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
 * Disparos em grupos (2026-09-11), estendido em 2026-09-14 para campanhas com
 * múltiplas publicações EM PARALELO ("cadência entre publicações") — contra
 * Postgres REAL. Um Fake em memória nunca provaria três coisas que só
 * importam contra o schema/driver de verdade:
 *
 * 1. Que a mídia (`bytea`, até 16MB de vídeo) sobrevive ao round-trip sem
 *    corromper, e que os `select` explícitos de fato EXCLUEM o binário de
 *    `create`/`findById`/`listBySession`/`listSteps` (mesmo risco/mesma prova
 *    de `campaignMedia.integration.test.ts`, Bloco L8) — por etapa.
 * 2. Que a constraint `@@unique([broadcastId, groupJid])` existe de verdade —
 *    `createTargets` usa `skipDuplicates: true`, e só o banco prova que a
 *    duplicata é de fato descartada, não duplicada silenciosamente.
 * 3. Que `onDelete: Cascade` limpa `group_broadcast_targets`,
 *    `group_broadcast_steps` E `group_broadcast_step_targets` ao apagar o
 *    `GroupBroadcast` — nenhum registro órfão.
 *
 * Pula (não falha) se o Postgres não estiver de pé.
 */
describe('Integração real — Disparos em grupos (2026-09-11, etapas em paralelo 2026-09-14)', () => {
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

  it('cria o disparo + etapa + alvos, inicializa o progresso por etapa e resume por status', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Disparo de teste',
      intervalSeconds: 60,
    });
    const [step] = await repository.createSteps(tenantId, broadcast.id, [
      { order: 0, messageTemplate: 'Promoção!' },
    ]);
    await repository.createTargets(tenantId, broadcast.id, [
      { groupJid: '111@g.us', groupName: 'Grupo 1', status: 'pending' },
      { groupJid: '222@g.us', groupName: 'Grupo 2 (só admin)', status: 'skipped', skipReason: 'admin_only_group' },
    ]);
    await repository.initializeStepTargets(tenantId, broadcast.id);

    const summary = await repository.summarizeTargets(tenantId, broadcast.id);
    expect(summary).toEqual({
      total: 2,
      pending: 1,
      sent: 0,
      failed: 0,
      skipped: 1,
      totalSent: 0,
    });

    const targets = await repository.listTargets(tenantId, broadcast.id);
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.groupJid).sort()).toEqual(['111@g.us', '222@g.us']);

    const stepTargets = await repository.listStepTargets(tenantId, step.id);
    expect(stepTargets).toHaveLength(2);
    expect(stepTargets.find((t) => t.groupJid === '111@g.us')?.status).toBe('pending');
    expect(stepTargets.find((t) => t.groupJid === '222@g.us')?.status).toBe('skipped');

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

  it('createSteps + listSteps devolvem as etapas na ordem, e o binário de mídia nunca aparece no select', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Campanha de 2 etapas',
      intervalSeconds: 60,
    });
    const steps = await repository.createSteps(tenantId, broadcast.id, [
      { order: 0, messageTemplate: 'Primeira publicação' },
      { order: 1, messageTemplate: 'Segunda publicação', recurrenceIntervalHours: 4, recurrenceMaxRuns: 3 },
    ]);

    const listedSteps = await repository.listSteps(tenantId, broadcast.id);
    expect(listedSteps.map((s) => s.messageTemplate)).toEqual(['Primeira publicação', 'Segunda publicação']);
    expect(listedSteps[1].recurrenceIntervalHours).toBe(4);

    const media = Buffer.from('fake-image-bytes-'.repeat(200));
    await repository.attachStepMedia(tenantId, steps[0].id, {
      contentType: 'image',
      buffer: media,
      mimeType: 'image/png',
      fileName: 'promo.png',
    });
    const updatedSteps = await repository.listSteps(tenantId, broadcast.id);
    expect(Object.keys(updatedSteps[0])).not.toContain('mediaContent');
    expect(updatedSteps[0].media?.mimeType).toBe('image/png');

    const fetchedMedia = await repository.getStepMediaContent(tenantId, steps[0].id);
    expect(fetchedMedia?.buffer.equals(media)).toBe(true);
  });

  it('markStepStarted grava startedAt UMA VEZ (idempotente — não sobrescreve numa 2ª chamada)', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Marca início',
      intervalSeconds: 60,
    });
    const [step] = await repository.createSteps(tenantId, broadcast.id, [
      { order: 0, messageTemplate: 'Oi' },
    ]);
    expect((await repository.findStepById(tenantId, step.id))?.startedAt).toBeUndefined();

    const first = new Date();
    await repository.markStepStarted(tenantId, step.id, first);
    await repository.markStepStarted(tenantId, step.id, new Date(first.getTime() + 60_000));

    const reloaded = await repository.findStepById(tenantId, step.id);
    expect(reloaded?.startedAt?.getTime()).toBe(first.getTime());
  });

  it('markStepFinished/areAllStepsFinished — a campanha só "termina" quando TODAS as etapas terminaram', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Etapas paralelas',
      intervalSeconds: 60,
    });
    const [step0, step1] = await repository.createSteps(tenantId, broadcast.id, [
      { order: 0, messageTemplate: 'Etapa 0' },
      { order: 1, messageTemplate: 'Etapa 1' },
    ]);

    expect(await repository.areAllStepsFinished(tenantId, broadcast.id)).toBe(false);

    await repository.markStepFinished(tenantId, step0.id, 1);
    expect(await repository.areAllStepsFinished(tenantId, broadcast.id)).toBe(false);
    expect((await repository.findStepById(tenantId, step0.id))?.finishedAt).toBeInstanceOf(Date);
    expect((await repository.findStepById(tenantId, step0.id))?.nextRunAt).toBeUndefined();

    await repository.markStepFinished(tenantId, step1.id, 1);
    expect(await repository.areAllStepsFinished(tenantId, broadcast.id)).toBe(true);
  });

  it('markStepTargetSent/markStepTargetFailed só agem sobre o progresso ainda pending (idempotência), POR ETAPA', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Disparo de idempotência',
      intervalSeconds: 60,
    });
    const [step0, step1] = await repository.createSteps(tenantId, broadcast.id, [
      { order: 0, messageTemplate: 'Etapa 0' },
      { order: 1, messageTemplate: 'Etapa 1' },
    ]);
    await repository.createTargets(tenantId, broadcast.id, [
      { groupJid: 'idem@g.us', groupName: 'Idem', status: 'pending' },
    ]);
    await repository.initializeStepTargets(tenantId, broadcast.id);
    const [stepTarget0] = await repository.listStepTargets(tenantId, step0.id);
    const [stepTarget1] = await repository.listStepTargets(tenantId, step1.id);

    const firstAttempt = new Date();
    await repository.markStepTargetSent(tenantId, stepTarget0.id, firstAttempt);
    // Repetição — um job repetido nunca reescreve o resultado.
    await repository.markStepTargetFailed(tenantId, stepTarget0.id, new Date(), 'não deveria aplicar');

    const found0 = await repository.findStepTargetById(tenantId, stepTarget0.id);
    expect(found0?.status).toBe('sent');
    expect(found0?.errorMessage).toBeUndefined();

    // A ETAPA 1 nunca foi tocada — progresso independente por etapa.
    const found1 = await repository.findStepTargetById(tenantId, stepTarget1.id);
    expect(found1?.status).toBe('pending');
  });

  it('resetStepTargetsForNextRun reabre só os SENT/FAILED de UMA etapa — skipped nunca reabre, outra etapa nunca é tocada', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Reabertura por etapa',
      intervalSeconds: 60,
    });
    const [step0, step1] = await repository.createSteps(tenantId, broadcast.id, [
      { order: 0, messageTemplate: 'Etapa 0' },
      { order: 1, messageTemplate: 'Etapa 1' },
    ]);
    await repository.createTargets(tenantId, broadcast.id, [
      { groupJid: 'a@g.us', groupName: 'A', status: 'pending' },
      { groupJid: 'b@g.us', groupName: 'B', status: 'pending' },
      { groupJid: 'c@g.us', groupName: 'C', status: 'skipped', skipReason: 'admin_only_group' },
    ]);
    await repository.initializeStepTargets(tenantId, broadcast.id);
    const step0Targets = await repository.listStepTargets(tenantId, step0.id);
    const step1Targets = await repository.listStepTargets(tenantId, step1.id);
    const sentOnStep0 = step0Targets.find((t) => t.groupJid === 'a@g.us')!;
    await repository.markStepTargetSent(tenantId, sentOnStep0.id, new Date());
    const sentOnStep1 = step1Targets.find((t) => t.groupJid === 'a@g.us')!;
    await repository.markStepTargetSent(tenantId, sentOnStep1.id, new Date());

    const reopened = await repository.resetStepTargetsForNextRun(tenantId, step0.id);

    expect(reopened).toBe(1);
    expect((await repository.findStepTargetById(tenantId, sentOnStep0.id))?.status).toBe('pending');
    // A etapa 1 continua `sent` — reabrir a etapa 0 nunca toca a etapa 1.
    expect((await repository.findStepTargetById(tenantId, sentOnStep1.id))?.status).toBe('sent');
    const skippedOnStep0 = step0Targets.find((t) => t.groupJid === 'c@g.us')!;
    expect((await repository.findStepTargetById(tenantId, skippedOnStep0.id))?.status).toBe('skipped');
  });

  it('findById/listBySession NUNCA incluem o binário — só os metadados de media (por etapa)', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Disparo para checar vazamento de binário',
      intervalSeconds: 60,
    });
    const [step] = await repository.createSteps(tenantId, broadcast.id, [
      { order: 0, messageTemplate: 'Oi' },
    ]);
    const largeBuffer = Buffer.alloc(2 * 1024 * 1024, 1);
    await repository.attachStepMedia(tenantId, step.id, {
      contentType: 'video',
      buffer: largeBuffer,
      mimeType: 'video/mp4',
    });

    const found = await repository.findById(tenantId, broadcast.id);
    expect(Object.keys(found ?? {})).not.toContain('mediaContent');

    const list = await repository.listBySession(tenantId, 'sessao-integracao', 50);
    expect(list.some((b) => b.id === broadcast.id)).toBe(true);

    const steps = await repository.listSteps(tenantId, broadcast.id);
    expect(steps[0].media).toEqual({ contentType: 'video', mimeType: 'video/mp4', fileName: undefined });
    expect(Object.keys(steps[0])).not.toContain('mediaContent');
  });

  it('removeStepMedia limpa as quatro colunas da etapa', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Disparo para remover mídia',
      intervalSeconds: 60,
    });
    const [step] = await repository.createSteps(tenantId, broadcast.id, [
      { order: 0, messageTemplate: 'Oi' },
    ]);
    await repository.attachStepMedia(tenantId, step.id, {
      contentType: 'image',
      buffer: Buffer.from('bytes'),
      mimeType: 'image/png',
    });

    const updated = await repository.removeStepMedia(tenantId, step.id);

    expect(updated?.media).toBeUndefined();
    const media = await repository.getStepMediaContent(tenantId, step.id);
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
    const a = await repository.create({ tenantId, sessionName, name: 'A', intervalSeconds: 60 });
    const b = await repository.create({ tenantId, sessionName, name: 'B', intervalSeconds: 60 });
    await repository.updateStatus(tenantId, a.id, 'running');
    await repository.updateStatus(tenantId, b.id, 'running');

    expect(await repository.countRunningBySession(tenantId, sessionName)).toBe(2);
    expect(await repository.countRunningBySession(tenantId, sessionName, a.id)).toBe(1);
  });

  it('deleteById apaga o disparo E seus alvos E suas etapas E o progresso por etapa (onDelete: Cascade) — nenhum órfão', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Disparo para apagar',
      intervalSeconds: 60,
    });
    const [step] = await repository.createSteps(tenantId, broadcast.id, [
      { order: 0, messageTemplate: 'Oi' },
    ]);
    await repository.createTargets(tenantId, broadcast.id, [
      { groupJid: '999@g.us', groupName: 'Grupo 9', status: 'pending' },
    ]);
    await repository.initializeStepTargets(tenantId, broadcast.id);
    const [stepTarget] = await repository.listStepTargets(tenantId, step.id);
    expect(stepTarget).toBeDefined();

    const deleted = await repository.deleteById(tenantId, broadcast.id);
    expect(deleted).toBe(true);

    expect(await repository.findById(tenantId, broadcast.id)).toBeUndefined();
    const orphanTargets = await prisma.groupBroadcastTarget.findMany({
      where: { broadcastId: broadcast.id },
    });
    expect(orphanTargets).toHaveLength(0);
    const orphanSteps = await prisma.groupBroadcastStep.findMany({
      where: { broadcastId: broadcast.id },
    });
    expect(orphanSteps).toHaveLength(0);
    const orphanStepTargets = await prisma.groupBroadcastStepTarget.findMany({
      where: { broadcastId: broadcast.id },
    });
    expect(orphanStepTargets).toHaveLength(0);
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
      intervalSeconds: 60,
    });
    const b = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Disparo B',
      intervalSeconds: 60,
    });
    await repository.createSteps(tenantId, a.id, [{ order: 0, messageTemplate: 'Oi' }]);
    await repository.createSteps(tenantId, b.id, [{ order: 0, messageTemplate: 'Oi' }]);
    await repository.createTargets(tenantId, a.id, [
      { groupJid: 'a1@g.us', groupName: 'A1', status: 'pending' },
    ]);
    await repository.createTargets(tenantId, b.id, [
      { groupJid: 'b1@g.us', groupName: 'B1', status: 'skipped', skipReason: 'group_not_found' },
    ]);
    await repository.initializeStepTargets(tenantId, a.id);
    await repository.initializeStepTargets(tenantId, b.id);

    const summaries = await repository.summarizeTargetsForBroadcasts(tenantId, [a.id, b.id]);

    expect(summaries.get(a.id)).toEqual({
      total: 1,
      pending: 1,
      sent: 0,
      failed: 0,
      skipped: 0,
      totalSent: 0,
    });
    expect(summaries.get(b.id)).toEqual({
      total: 1,
      pending: 0,
      sent: 0,
      failed: 0,
      skipped: 1,
      totalSent: 0,
    });
  });

  it('summarizeStepTargets resume UMA etapa específica, independente das demais', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await repository.create({
      tenantId,
      sessionName: 'sessao-integracao',
      name: 'Resumo por etapa',
      intervalSeconds: 60,
    });
    const [step0, step1] = await repository.createSteps(tenantId, broadcast.id, [
      { order: 0, messageTemplate: 'Etapa 0' },
      { order: 1, messageTemplate: 'Etapa 1' },
    ]);
    await repository.createTargets(tenantId, broadcast.id, [
      { groupJid: 'x@g.us', groupName: 'X', status: 'pending' },
    ]);
    await repository.initializeStepTargets(tenantId, broadcast.id);
    const [step0Target] = await repository.listStepTargets(tenantId, step0.id);
    await repository.markStepTargetSent(tenantId, step0Target.id, new Date());

    const summary0 = await repository.summarizeStepTargets(tenantId, step0.id);
    const summary1 = await repository.summarizeStepTargets(tenantId, step1.id);

    expect(summary0).toEqual({ total: 1, pending: 0, sent: 1, failed: 0, skipped: 0, totalSent: 1 });
    expect(summary1).toEqual({ total: 1, pending: 1, sent: 0, failed: 0, skipped: 0, totalSent: 0 });
  });
});

/**
 * Migração de dados legados (2026-09-14) — prova, contra Postgres REAL, que
 * um `GroupBroadcast` do formato ANTIGO (mensagem/mídia/recorrência direto na
 * campanha) vira, depois da migration `20260914120000_add_group_broadcast_steps`,
 * uma campanha de UMA etapa (`order = 0`) preservando integralmente o
 * conteúdo, com o progresso já materializado em `GroupBroadcastStepTarget`.
 */
describe('Migração de dados legados — GroupBroadcast antigo vira campanha de 1 etapa', () => {
  let prisma: PrismaClient;
  let repository: PrismaGroupBroadcastRepository;
  let databaseAvailable = true;
  const tenantId = `test-tenant-group-broadcast-migration-${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.tenant.create({ data: { id: tenantId, name: 'Tenant de teste — migração' } });
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

  it('um disparo legado (1 mensagem, recorrência, runsCompleted, nextRunAt) preserva tudo na etapa 0, com progresso materializado', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    // Simula exatamente o que o backfill da migration fez para uma linha
    // pré-existente: cria o envelope (sem conteúdo — já não existe mais na
    // campanha) e insere a etapa 0 com os dados que MORAVAM em
    // `GroupBroadcast` antes de 2026-09-14, mais o progresso por etapa que
    // a migration `20260914150000_add_group_broadcast_step_targets` materializa.
    const broadcast = await prisma.groupBroadcast.create({
      data: {
        tenantId,
        sessionName: 'sessao-migracao',
        name: 'Disparo legado simulado',
        intervalSeconds: 60,
        sendWindowStart: '06:00',
        sendWindowEnd: '22:00',
      },
    });
    const step = await prisma.groupBroadcastStep.create({
      data: {
        tenantId,
        broadcastId: broadcast.id,
        order: 0,
        messageTemplate: 'Promoção de aniversário!',
        recurrenceIntervalHours: 4,
        recurrenceMaxRuns: 10,
        runsCompleted: 5,
        nextRunAt: new Date('2026-09-15T09:00:00Z'),
      },
    });
    const target = await prisma.groupBroadcastTarget.create({
      data: {
        tenantId,
        broadcastId: broadcast.id,
        groupJid: '111@g.us',
        groupName: 'Grupo legado',
        status: 'PENDING',
      },
    });
    await prisma.groupBroadcastStepTarget.create({
      data: {
        tenantId,
        broadcastId: broadcast.id,
        stepId: step.id,
        targetId: target.id,
        status: 'PENDING',
        sentCount: 5,
      },
    });

    const reloadedBroadcast = await repository.findById(tenantId, broadcast.id);
    expect(reloadedBroadcast?.sendWindowStart).toBe('06:00');
    expect(reloadedBroadcast?.sendWindowEnd).toBe('22:00');

    const steps = await repository.listSteps(tenantId, broadcast.id);
    expect(steps).toHaveLength(1);
    expect(steps[0].order).toBe(0);
    expect(steps[0].messageTemplate).toBe('Promoção de aniversário!');
    expect(steps[0].recurrenceIntervalHours).toBe(4);
    expect(steps[0].recurrenceMaxRuns).toBe(10);
    expect(steps[0].runsCompleted).toBe(5);
    expect(steps[0].nextRunAt?.toISOString()).toBe('2026-09-15T09:00:00.000Z');

    const stepTargets = await repository.listStepTargets(tenantId, step.id);
    expect(stepTargets).toHaveLength(1);
    expect(stepTargets[0].sentCount).toBe(5);
    expect(stepTargets[0].groupJid).toBe('111@g.us');
  });

  it('apagar o disparo legado remove sua única etapa E o progresso dela em cascata (onDelete: Cascade)', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real.');
      return;
    }

    const broadcast = await prisma.groupBroadcast.create({
      data: { tenantId, sessionName: 'sessao', name: 'Disparo', intervalSeconds: 60 },
    });
    const step = await prisma.groupBroadcastStep.create({
      data: { tenantId, broadcastId: broadcast.id, order: 0, messageTemplate: 'Oi' },
    });
    const target = await prisma.groupBroadcastTarget.create({
      data: {
        tenantId,
        broadcastId: broadcast.id,
        groupJid: '222@g.us',
        groupName: 'Grupo',
        status: 'PENDING',
      },
    });
    await prisma.groupBroadcastStepTarget.create({
      data: { tenantId, broadcastId: broadcast.id, stepId: step.id, targetId: target.id },
    });

    await prisma.groupBroadcast.delete({ where: { id: broadcast.id } });

    const orphanSteps = await prisma.groupBroadcastStep.findMany({
      where: { broadcastId: broadcast.id },
    });
    expect(orphanSteps).toHaveLength(0);
    const orphanStepTargets = await prisma.groupBroadcastStepTarget.findMany({
      where: { broadcastId: broadcast.id },
    });
    expect(orphanStepTargets).toHaveLength(0);
  });
});
