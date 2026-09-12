import { GroupBroadcastRunJobProcessor } from '../../../../src/services/groupBroadcasts/infrastructure/GroupBroadcastRunJobProcessor';
import { GroupBroadcastSendJobProcessor } from '../../../../src/services/groupBroadcasts/infrastructure/GroupBroadcastSendJobProcessor';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import {
  FakeGroupBroadcastRepository,
  FakeGroupBroadcastSendDispatcher,
  FakeGroupMessageSender,
} from '../fakes';

function buildSut(): {
  sendProcessor: GroupBroadcastSendJobProcessor;
  runProcessor: GroupBroadcastRunJobProcessor;
  repository: FakeGroupBroadcastRepository;
  dispatcher: FakeGroupBroadcastSendDispatcher;
  sender: FakeGroupMessageSender;
} {
  const repository = new FakeGroupBroadcastRepository();
  const sender = new FakeGroupMessageSender();
  const dispatcher = new FakeGroupBroadcastSendDispatcher();
  return {
    sendProcessor: new GroupBroadcastSendJobProcessor(
      repository,
      sender,
      new NoopLogger(),
      dispatcher,
    ),
    runProcessor: new GroupBroadcastRunJobProcessor(repository, dispatcher, new NoopLogger()),
    repository,
    dispatcher,
    sender,
  };
}

/** Um grupo só: o disparo termina a repetição no primeiro envio. */
function seedRunning(
  repository: FakeGroupBroadcastRepository,
  recurrence: Record<string, unknown> = {},
): { broadcastId: string; targetIds: string[] } {
  return repository.seedBroadcast({
    tenantId: 'tenant-1',
    sessionName: 'sessao',
    status: 'running',
    groupJids: ['111@g.us'],
    ...recurrence,
  });
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

describe('Recorrência — fim de uma repetição (GroupBroadcastSendJobProcessor)', () => {
  it('disparo ÚNICO: conclui, como sempre foi', async () => {
    const { sendProcessor, repository, dispatcher } = buildSut();
    const { broadcastId, targetIds } = seedRunning(repository);

    await sendProcessor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[0] });

    expect((await repository.findById('tenant-1', broadcastId))?.status).toBe('completed');
    expect(dispatcher.runs).toHaveLength(0);
  });

  it('recorrente: agenda a próxima repetição e continua em execução', async () => {
    const { sendProcessor, repository, dispatcher } = buildSut();
    const { broadcastId, targetIds } = seedRunning(repository, {
      recurrenceIntervalHours: 2,
      recurrenceMaxRuns: 3,
    });

    await sendProcessor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[0] });

    const broadcast = await repository.findById('tenant-1', broadcastId);
    expect(broadcast?.status).toBe('running');
    expect(broadcast?.runsCompleted).toBe(1);
    expect(broadcast?.nextRunAt).toBeInstanceOf(Date);
    expect(dispatcher.runs).toHaveLength(1);
    expect(dispatcher.runs[0]).toMatchObject({ broadcastId, runNumber: 2 });
    expect(dispatcher.runs[0].delayMs).toBeGreaterThan(2 * 60 * 60 * 1000 - 60000);
  });
});

describe('Recorrência — término do ciclo', () => {
  it('na ÚLTIMA repetição: conclui em vez de agendar outra', async () => {
    const { sendProcessor, repository, dispatcher } = buildSut();
    const { broadcastId, targetIds } = seedRunning(repository, {
      recurrenceIntervalHours: 1,
      recurrenceMaxRuns: 2,
      runsCompleted: 1,
    });

    await sendProcessor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[0] });

    const broadcast = await repository.findById('tenant-1', broadcastId);
    expect(broadcast?.status).toBe('completed');
    expect(broadcast?.runsCompleted).toBe(2);
    expect(broadcast?.nextRunAt).toBeUndefined();
    expect(dispatcher.runs).toHaveLength(0);
  });

  it('com data de término já alcançada: conclui', async () => {
    const { sendProcessor, repository, dispatcher } = buildSut();
    const { broadcastId, targetIds } = seedRunning(repository, {
      recurrenceIntervalHours: 2,
      recurrenceEndsAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    await sendProcessor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[0] });

    expect((await repository.findById('tenant-1', broadcastId))?.status).toBe('completed');
    expect(dispatcher.runs).toHaveLength(0);
  });

  // Trava de regressão: sem o dispatcher (modo degradado) um disparo recorrente
  // precisa ENCERRAR, nunca ficar "em execução" para sempre sem nada agendado.
  it('sem motor de fila configurado: conclui em vez de ficar preso', async () => {
    const repository = new FakeGroupBroadcastRepository();
    const processor = new GroupBroadcastSendJobProcessor(
      repository,
      new FakeGroupMessageSender(),
      new NoopLogger(),
    );
    const { broadcastId, targetIds } = seedRunning(repository, { recurrenceIntervalHours: 2 });

    await processor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[0] });

    expect((await repository.findById('tenant-1', broadcastId))?.status).toBe('completed');
  });
});

describe('Recorrência — início de uma repetição (GroupBroadcastRunJobProcessor)', () => {
  it('reabre os alvos já publicados e reagenda os envios', async () => {
    const { runProcessor, repository, dispatcher } = buildSut();
    const { broadcastId, targetIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'running',
      groupJids: ['111@g.us', '222@g.us'],
      recurrenceIntervalHours: 2,
    });
    repository.forceTarget(targetIds[0], { status: 'sent' });
    repository.forceTarget(targetIds[1], { status: 'failed', errorMessage: 'falhou antes' });

    await expect(
      runProcessor.process({ tenantId: 'tenant-1', broadcastId, runNumber: 2 }),
    ).resolves.toBe('started');

    expect(dispatcher.scheduled).toHaveLength(2);
    const reaberto = await repository.findTargetById('tenant-1', targetIds[1]);
    expect(reaberto?.status).toBe('pending');
    expect(reaberto?.errorMessage).toBeUndefined();
  });

  it('disparo pausado ou cancelado: não republica nada', async () => {
    const { runProcessor, repository, dispatcher } = buildSut();
    const { broadcastId } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'paused',
      groupJids: ['111@g.us'],
      recurrenceIntervalHours: 2,
    });

    await expect(
      runProcessor.process({ tenantId: 'tenant-1', broadcastId, runNumber: 2 }),
    ).resolves.toBe('skipped');
    expect(dispatcher.scheduled).toHaveLength(0);
  });
});

describe('Recorrência — janela de horário e alvos esgotados', () => {
  it('fora da janela: adia para a abertura, nunca descarta', async () => {
    const { runProcessor, repository, dispatcher } = buildSut();
    const agora = new Date();
    // Janela que ACABA de fechar: qualquer instante atual está fora dela.
    const fim = pad(agora.getHours()) + ':' + pad(agora.getMinutes());
    const inicio = pad((agora.getHours() + 23) % 24) + ':' + pad(agora.getMinutes());
    const { broadcastId } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'running',
      groupJids: ['111@g.us'],
      recurrenceIntervalHours: 2,
      sendWindowStart: inicio,
      sendWindowEnd: fim,
    });

    await expect(
      runProcessor.process({ tenantId: 'tenant-1', broadcastId, runNumber: 2 }),
    ).resolves.toBe('postponed');
    expect(dispatcher.scheduled).toHaveLength(0);
    expect(dispatcher.runs).toHaveLength(1);
    expect((await repository.findById('tenant-1', broadcastId))?.nextRunAt).toBeInstanceOf(Date);
  });

  it('nenhum grupo elegível restou: encerra em vez de repetir o vazio', async () => {
    const { runProcessor, repository, dispatcher } = buildSut();
    const { broadcastId, targetIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'running',
      groupJids: ['111@g.us'],
      recurrenceIntervalHours: 2,
    });
    repository.forceTarget(targetIds[0], { status: 'skipped', skipReason: 'admin_only_group' });

    await expect(
      runProcessor.process({ tenantId: 'tenant-1', broadcastId, runNumber: 2 }),
    ).resolves.toBe('completed_without_targets');
    expect((await repository.findById('tenant-1', broadcastId))?.status).toBe('completed');
    expect(dispatcher.scheduled).toHaveLength(0);
  });
});
