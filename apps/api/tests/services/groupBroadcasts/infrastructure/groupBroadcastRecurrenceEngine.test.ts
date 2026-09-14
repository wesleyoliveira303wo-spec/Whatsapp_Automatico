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
): { broadcastId: string; targetIds: string[]; stepIds: string[]; stepTargetIds: string[][] } {
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
  it('disparo ÚNICO (1 etapa, sem recorrência): conclui, como sempre foi', async () => {
    const { sendProcessor, repository, dispatcher } = buildSut();
    const { broadcastId, stepIds, stepTargetIds } = seedRunning(repository);

    await sendProcessor.process({
      tenantId: 'tenant-1',
      broadcastId,
      stepId: stepIds[0],
      stepTargetId: stepTargetIds[0][0],
    });

    expect((await repository.findById('tenant-1', broadcastId))?.status).toBe('completed');
    expect(dispatcher.runs).toHaveLength(0);
  });

  it('recorrente: agenda a próxima repetição da MESMA etapa e continua em execução', async () => {
    const { sendProcessor, repository, dispatcher } = buildSut();
    const { broadcastId, stepIds, stepTargetIds } = seedRunning(repository, {
      recurrenceIntervalHours: 2,
      recurrenceMaxRuns: 3,
    });

    await sendProcessor.process({
      tenantId: 'tenant-1',
      broadcastId,
      stepId: stepIds[0],
      stepTargetId: stepTargetIds[0][0],
    });

    const broadcast = await repository.findById('tenant-1', broadcastId);
    expect(broadcast?.status).toBe('running');
    const [step] = await repository.listSteps('tenant-1', broadcastId);
    expect(step.runsCompleted).toBe(1);
    expect(step.nextRunAt).toBeInstanceOf(Date);
    expect(step.finishedAt).toBeUndefined();
    expect(dispatcher.runs).toHaveLength(1);
    expect(dispatcher.runs[0]).toMatchObject({ broadcastId, stepId: stepIds[0], runNumber: 2 });
    expect(dispatcher.runs[0].delayMs).toBeGreaterThan(2 * 60 * 60 * 1000 - 60000);
  });
});

describe('Recorrência — término do ciclo', () => {
  it('na ÚLTIMA repetição: conclui em vez de agendar outra', async () => {
    const { sendProcessor, repository, dispatcher } = buildSut();
    const { broadcastId, stepIds, stepTargetIds } = seedRunning(repository, {
      recurrenceIntervalHours: 1,
      recurrenceMaxRuns: 2,
      runsCompleted: 1,
    });

    await sendProcessor.process({
      tenantId: 'tenant-1',
      broadcastId,
      stepId: stepIds[0],
      stepTargetId: stepTargetIds[0][0],
    });

    const broadcast = await repository.findById('tenant-1', broadcastId);
    expect(broadcast?.status).toBe('completed');
    const [step] = await repository.listSteps('tenant-1', broadcastId);
    expect(step.runsCompleted).toBe(2);
    expect(step.nextRunAt).toBeUndefined();
    expect(step.finishedAt).toBeInstanceOf(Date);
    expect(dispatcher.runs).toHaveLength(0);
  });

  it('com data de término já alcançada: conclui', async () => {
    const { sendProcessor, repository, dispatcher } = buildSut();
    const { broadcastId, stepIds, stepTargetIds } = seedRunning(repository, {
      recurrenceIntervalHours: 2,
      recurrenceEndsAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    await sendProcessor.process({
      tenantId: 'tenant-1',
      broadcastId,
      stepId: stepIds[0],
      stepTargetId: stepTargetIds[0][0],
    });

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
    const { broadcastId, stepIds, stepTargetIds } = seedRunning(repository, {
      recurrenceIntervalHours: 2,
    });

    await processor.process({
      tenantId: 'tenant-1',
      broadcastId,
      stepId: stepIds[0],
      stepTargetId: stepTargetIds[0][0],
    });

    expect((await repository.findById('tenant-1', broadcastId))?.status).toBe('completed');
  });
});

describe('Etapas em paralelo (2026-09-14, "cadência entre publicações")', () => {
  it('etapa SEM recorrência, com outra etapa ainda ativa: encerra a SUA (finishedAt), campanha continua running', async () => {
    const { sendProcessor, repository, dispatcher, sender } = buildSut();
    const { broadcastId, stepIds, stepTargetIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'running',
      groupJids: ['111@g.us'],
      messageTemplate: 'Etapa 0, sem recorrência',
      extraSteps: [{ messageTemplate: 'Etapa 1' }],
    });

    await sendProcessor.process({
      tenantId: 'tenant-1',
      broadcastId,
      stepId: stepIds[0],
      stepTargetId: stepTargetIds[0][0],
    });

    const broadcast = await repository.findById('tenant-1', broadcastId);
    expect(broadcast?.status).toBe('running'); // a etapa 1 ainda não terminou
    const steps = await repository.listSteps('tenant-1', broadcastId);
    expect(steps[0].finishedAt).toBeInstanceOf(Date);
    expect(steps[1].finishedAt).toBeUndefined();
    expect(dispatcher.runs).toHaveLength(0); // nunca "avança" para outra etapa
    expect(sender.calls[0].content).toBe('Etapa 0, sem recorrência');
  });

  it('etapa recorrente ainda dentro do teto: repete SÓ ELA MESMA — a outra etapa nunca é tocada', async () => {
    const { sendProcessor, repository, dispatcher, sender } = buildSut();
    const { broadcastId, stepIds, stepTargetIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'running',
      groupJids: ['111@g.us'],
      messageTemplate: 'Etapa recorrente',
      recurrenceIntervalHours: 4,
      recurrenceMaxRuns: 5,
      runsCompleted: 1,
      extraSteps: [{ messageTemplate: 'Outra etapa, independente' }],
    });

    await sendProcessor.process({
      tenantId: 'tenant-1',
      broadcastId,
      stepId: stepIds[0],
      stepTargetId: stepTargetIds[0][0],
    });

    const broadcast = await repository.findById('tenant-1', broadcastId);
    expect(broadcast?.status).toBe('running');
    expect(dispatcher.runs).toHaveLength(1);
    expect(dispatcher.runs[0]).toMatchObject({ stepId: stepIds[0], runNumber: 3 });
    expect(sender.calls).toHaveLength(1);
    expect(sender.calls[0].content).toBe('Etapa recorrente'); // nunca a outra etapa
  });

  it('duas etapas: cada uma publica a SUA PRÓPRIA mensagem, independente da outra', async () => {
    const { sendProcessor, repository, sender } = buildSut();
    const { broadcastId, stepIds, stepTargetIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'running',
      groupJids: ['111@g.us'],
      messageTemplate: 'Mensagem da etapa 0',
      extraSteps: [{ messageTemplate: 'Mensagem da etapa 1' }],
    });

    await sendProcessor.process({
      tenantId: 'tenant-1',
      broadcastId,
      stepId: stepIds[1],
      stepTargetId: stepTargetIds[1][0],
    });

    expect(sender.calls[0].content).toBe('Mensagem da etapa 1');
    // A etapa 0 continua intocada — nunca foi processada nesta chamada.
    const steps = await repository.listSteps('tenant-1', broadcastId);
    expect(steps[0].runsCompleted).toBe(0);
    expect(steps[0].finishedAt).toBeUndefined();
  });
});

describe('Recorrência — início de uma repetição (GroupBroadcastRunJobProcessor)', () => {
  it('reabre os alvos já publicados DESTA ETAPA e reagenda os envios', async () => {
    const { runProcessor, repository, dispatcher } = buildSut();
    const { broadcastId, stepIds, stepTargetIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'running',
      groupJids: ['111@g.us', '222@g.us'],
      recurrenceIntervalHours: 2,
    });
    repository.forceStepTarget(stepTargetIds[0][0], { status: 'sent' });
    repository.forceStepTarget(stepTargetIds[0][1], { status: 'failed', errorMessage: 'falhou antes' });

    await expect(
      runProcessor.process({ tenantId: 'tenant-1', broadcastId, stepId: stepIds[0], runNumber: 2 }),
    ).resolves.toBe('started');

    expect(dispatcher.scheduled).toHaveLength(2);
    const reaberto = await repository.findStepTargetById('tenant-1', stepTargetIds[0][1]);
    expect(reaberto?.status).toBe('pending');
    expect(reaberto?.errorMessage).toBeUndefined();
  });

  it('disparo pausado ou cancelado: não republica nada', async () => {
    const { runProcessor, repository, dispatcher } = buildSut();
    const { broadcastId, stepIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'paused',
      groupJids: ['111@g.us'],
      recurrenceIntervalHours: 2,
    });

    await expect(
      runProcessor.process({ tenantId: 'tenant-1', broadcastId, stepId: stepIds[0], runNumber: 2 }),
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
    const { broadcastId, stepIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'running',
      groupJids: ['111@g.us'],
      recurrenceIntervalHours: 2,
      sendWindowStart: inicio,
      sendWindowEnd: fim,
    });

    await expect(
      runProcessor.process({ tenantId: 'tenant-1', broadcastId, stepId: stepIds[0], runNumber: 2 }),
    ).resolves.toBe('postponed');
    expect(dispatcher.scheduled).toHaveLength(0);
    expect(dispatcher.runs).toHaveLength(1);
    const [step] = await repository.listSteps('tenant-1', broadcastId);
    expect(step.nextRunAt).toBeInstanceOf(Date);
  });

  it('nenhum grupo elegível restou NESTA ETAPA: encerra ela (finishedAt), sem tocar outras etapas', async () => {
    const { runProcessor, repository, dispatcher } = buildSut();
    const { broadcastId, stepIds, stepTargetIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'running',
      groupJids: ['111@g.us'],
      recurrenceIntervalHours: 2,
      extraSteps: [{ messageTemplate: 'Outra etapa, com grupo elegível' }],
    });
    repository.forceStepTarget(stepTargetIds[0][0], {
      status: 'skipped',
      skipReason: 'admin_only_group',
    });

    await expect(
      runProcessor.process({ tenantId: 'tenant-1', broadcastId, stepId: stepIds[0], runNumber: 2 }),
    ).resolves.toBe('completed_without_targets');
    const steps = await repository.listSteps('tenant-1', broadcastId);
    expect(steps[0].finishedAt).toBeInstanceOf(Date);
    // A campanha NÃO completa — a outra etapa ainda não terminou.
    expect((await repository.findById('tenant-1', broadcastId))?.status).toBe('running');
    expect(dispatcher.scheduled).toHaveLength(0);
  });

  it('nenhum grupo elegível e é a ÚNICA etapa: completa a campanha', async () => {
    const { runProcessor, repository } = buildSut();
    const { broadcastId, stepIds, stepTargetIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'running',
      groupJids: ['111@g.us'],
      recurrenceIntervalHours: 2,
    });
    repository.forceStepTarget(stepTargetIds[0][0], {
      status: 'skipped',
      skipReason: 'admin_only_group',
    });

    await runProcessor.process({ tenantId: 'tenant-1', broadcastId, stepId: stepIds[0], runNumber: 2 });

    expect((await repository.findById('tenant-1', broadcastId))?.status).toBe('completed');
  });
});
