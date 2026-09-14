import { GroupBroadcastService } from '../../../../src/services/groupBroadcasts/application/GroupBroadcastService';
import {
  InvalidRecurrenceError,
  GroupBroadcastEngineNotConfiguredError,
  GroupBroadcastMediaNotFoundError,
  GroupBroadcastMediaTooLargeError,
  GroupBroadcastMediaTypeMismatchError,
  GroupBroadcastNotFoundError,
  GroupBroadcastRequiresPaidPlanError,
  GroupBroadcastStepNotFoundError,
  GroupDirectoryUnavailableError,
  InvalidGroupBroadcastTransitionError,
  NoGroupsSelectedError,
  NoStepsProvidedError,
  TooManyGroupsSelectedError,
  TooManyStepsError,
} from '../../../../src/services/groupBroadcasts/domain/errors/groupBroadcastErrors';
import { TenantNotFoundError } from '../../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import {
  FakeAuditLogRepository,
  FakeGroupBroadcastRepository,
  FakeGroupBroadcastSendDispatcher,
  FakeGroupDirectory,
} from '../fakes';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const MP4_BYTES = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69]);

function buildSut(
  options: { plan?: 'free' | 'pro' | 'enterprise'; withDispatcher?: boolean } = {},
): {
  service: GroupBroadcastService;
  repository: FakeGroupBroadcastRepository;
  directory: FakeGroupDirectory;
  dispatcher: FakeGroupBroadcastSendDispatcher;
  audit: FakeAuditLogRepository;
} {
  const tenants = new FakeTenantRepository();
  tenants.seed({ id: 'tenant-1', name: 'Um', apiKeyHash: 'h1', plan: options.plan });
  tenants.seed({ id: 'tenant-2', name: 'Dois', apiKeyHash: 'h2' });
  const repository = new FakeGroupBroadcastRepository();
  const directory = new FakeGroupDirectory();
  directory.entries = [
    { jid: 'aberto@g.us', name: 'Clientes VIP', participantCount: 120, canSend: true },
    { jid: 'admin@g.us', name: 'Avisos', participantCount: 300, canSend: false },
    { jid: 'outro@g.us', name: 'Parceiros', participantCount: 40, canSend: true },
  ];
  const dispatcher = new FakeGroupBroadcastSendDispatcher();
  const audit = new FakeAuditLogRepository();
  const service = new GroupBroadcastService(
    repository,
    tenants,
    directory,
    new NoopLogger(),
    options.withDispatcher === false ? undefined : dispatcher,
    audit,
  );
  return { service, repository, directory, dispatcher, audit };
}

const baseInput = {
  tenantId: 'tenant-1',
  sessionName: 'sessao',
  name: 'Promo de setembro',
  steps: [{ messageTemplate: 'Confira a promoção!' }],
};

describe('GroupBroadcastService (Disparos em grupos)', () => {
  describe('createBroadcast()', () => {
    it('confere os grupos no servidor: aceita os que aceitam envio, suprime "só admins" e desconhecidos', async () => {
      const { service, directory } = buildSut();

      const result = await service.createBroadcast({
        ...baseInput,
        groupJids: ['aberto@g.us', 'admin@g.us', 'sumiu@g.us'],
      });

      expect(directory.calls).toEqual([{ tenantId: 'tenant-1', sessionName: 'sessao' }]);
      expect(result.broadcast.status).toBe('draft');
      expect(result.summary).toEqual({
        total: 3,
        pending: 1,
        sent: 0,
        failed: 0,
        skipped: 2,
        totalSent: 0,
      });
      const byJid = new Map(result.targets.map((t) => [t.groupJid, t]));
      expect(byJid.get('aberto@g.us')).toMatchObject({ status: 'pending', groupName: 'Clientes VIP' });
      expect(byJid.get('admin@g.us')).toMatchObject({
        status: 'skipped',
        skipReason: 'admin_only_group',
        groupName: 'Avisos',
      });
      expect(byJid.get('sumiu@g.us')).toMatchObject({
        status: 'skipped',
        skipReason: 'group_not_found',
      });
    });

    it('usa o NOME do grupo da listagem ao vivo, nunca um nome vindo do cliente', async () => {
      const { service } = buildSut();
      const result = await service.createBroadcast({ ...baseInput, groupJids: ['outro@g.us'] });
      expect(result.targets[0].groupName).toBe('Parceiros');
    });

    it('deduplica grupos repetidos e ignora ids vazios', async () => {
      const { service } = buildSut();
      const result = await service.createBroadcast({
        ...baseInput,
        groupJids: ['aberto@g.us', ' aberto@g.us ', '', 'outro@g.us'],
      });
      expect(result.summary.total).toBe(2);
    });

    it('sem nenhum grupo: NoGroupsSelectedError (e nem consulta o WhatsApp)', async () => {
      const { service, directory } = buildSut();
      await expect(service.createBroadcast({ ...baseInput, groupJids: [] })).rejects.toBeInstanceOf(
        NoGroupsSelectedError,
      );
      expect(directory.calls).toHaveLength(0);
    });

    it('acima de 30 grupos: TooManyGroupsSelectedError (teto anti-banimento, no serviço também)', async () => {
      const { service } = buildSut();
      const groupJids = Array.from({ length: 31 }, (_, i) => `g${i}@g.us`);
      await expect(service.createBroadcast({ ...baseInput, groupJids })).rejects.toBeInstanceOf(
        TooManyGroupsSelectedError,
      );
    });

    it('WhatsApp desconectado: a criação FALHA em vez de gravar alvos sem conferência', async () => {
      const { service, directory, repository } = buildSut();
      directory.nextError = new GroupDirectoryUnavailableError('not_connected');

      await expect(
        service.createBroadcast({ ...baseInput, groupJids: ['aberto@g.us'] }),
      ).rejects.toBeInstanceOf(GroupDirectoryUnavailableError);
      expect(await repository.listBySession('tenant-1', 'sessao', 10)).toHaveLength(0);
    });

    it('intervalo abaixo do piso é elevado para 30s', async () => {
      const { service } = buildSut();
      const result = await service.createBroadcast({
        ...baseInput,
        groupJids: ['aberto@g.us'],
        intervalSeconds: 5,
      });
      expect(result.broadcast.intervalSeconds).toBe(30);
    });

    it('registra a criação na trilha de auditoria, com o ator', async () => {
      const { service, audit } = buildSut();
      const result = await service.createBroadcast(
        { ...baseInput, groupJids: ['aberto@g.us'], createdByUserId: 'user-9' },
        { userId: 'user-9', ip: '10.0.0.1' },
      );
      expect(audit.entries).toEqual([
        expect.objectContaining({
          tenantId: 'tenant-1',
          actorUserId: 'user-9',
          action: 'group_broadcast.created',
          targetType: 'group_broadcast',
          targetId: result.broadcast.id,
          ip: '10.0.0.1',
        }),
      ]);
    });

    it('falha da trilha de auditoria nunca derruba a criação', async () => {
      const { service, audit } = buildSut();
      audit.failNext = true;
      await expect(
        service.createBroadcast({ ...baseInput, groupJids: ['aberto@g.us'] }),
      ).resolves.toBeDefined();
    });

    it('tenant inexistente: TenantNotFoundError', async () => {
      const { service } = buildSut();
      await expect(
        service.createBroadcast({ ...baseInput, tenantId: 'nao-existe', groupJids: ['aberto@g.us'] }),
      ).rejects.toBeInstanceOf(TenantNotFoundError);
    });
  });

  describe('createBroadcast() com múltiplas etapas (2026-09-14)', () => {
    it('cria a campanha com N etapas, na ordem enviada, cada uma com sua própria recorrência', async () => {
      const { service } = buildSut();

      const result = await service.createBroadcast({
        ...baseInput,
        groupJids: ['aberto@g.us'],
        steps: [
          { messageTemplate: 'Post 1' },
          { messageTemplate: 'Post 2', recurrenceIntervalHours: 24, recurrenceMaxRuns: 2 },
          { messageTemplate: 'Post 3' },
        ],
      });

      expect(result.steps).toHaveLength(3);
      expect(result.steps.map((s) => s.messageTemplate)).toEqual(['Post 1', 'Post 2', 'Post 3']);
      expect(result.steps[1].recurrenceIntervalHours).toBe(24);
    });

    it('recusa campanha sem nenhuma etapa', async () => {
      const { service } = buildSut();

      await expect(
        service.createBroadcast({ ...baseInput, groupJids: ['aberto@g.us'], steps: [] }),
      ).rejects.toBeInstanceOf(NoStepsProvidedError);
    });

    it('recusa campanha com mais de 20 etapas', async () => {
      const { service } = buildSut();
      const steps = Array.from({ length: 21 }, (_, i) => ({ messageTemplate: `Post ${i}` }));

      await expect(
        service.createBroadcast({ ...baseInput, groupJids: ['aberto@g.us'], steps }),
      ).rejects.toBeInstanceOf(TooManyStepsError);
    });
  });

  describe('listBroadcasts() / getBroadcast()', () => {
    it('lista só a sessão pedida, com resumo por disparo', async () => {
      const { service, repository } = buildSut();
      repository.seedBroadcast({ tenantId: 'tenant-1', sessionName: 'sessao', groupJids: ['a@g.us', 'b@g.us'] });
      repository.seedBroadcast({ tenantId: 'tenant-1', sessionName: 'outra' });

      const list = await service.listBroadcasts('tenant-1', 'sessao');

      expect(list).toHaveLength(1);
      expect(list[0].summary).toMatchObject({ total: 2, pending: 2 });
    });

    it('devolve as etapas junto com o detalhe', async () => {
      const { service, repository } = buildSut();
      const { broadcastId } = repository.seedBroadcast({
        tenantId: 'tenant-1',
        messageTemplate: 'Post único',
      });

      const detail = await service.getBroadcast('tenant-1', broadcastId);

      expect(detail.steps).toHaveLength(1);
      expect(detail.steps[0].messageTemplate).toBe('Post único');
    });

    it('IDOR: disparo de outro tenant não é encontrado', async () => {
      const { service, repository } = buildSut();
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-2' });
      await expect(service.getBroadcast('tenant-1', broadcastId)).rejects.toBeInstanceOf(
        GroupBroadcastNotFoundError,
      );
    });
  });

  describe('startBroadcast()', () => {
    it('1º início: agenda um "run" por etapa (nunca envia direto — a janela é checada no run) e move para running', async () => {
      const { service, repository, dispatcher, audit } = buildSut();
      const { broadcastId, stepIds } = repository.seedBroadcast({
        tenantId: 'tenant-1',
        groupJids: ['a@g.us', 'b@g.us', 'c@g.us'],
        intervalSeconds: 60,
      });

      const broadcast = await service.startBroadcast('tenant-1', broadcastId, { userId: 'u1' });

      expect(broadcast.status).toBe('running');
      expect(dispatcher.scheduled).toHaveLength(0);
      expect(dispatcher.runs).toEqual([
        { tenantId: 'tenant-1', broadcastId, stepId: stepIds[0], runNumber: 1, delayMs: 0 },
      ]);
      const [step] = await repository.listSteps('tenant-1', broadcastId);
      expect(step.startedAt).toBeInstanceOf(Date);
      expect(audit.entries.map((e) => e.action)).toEqual(['group_broadcast.started']);
    });

    // Trava de regressão (2026-09-14): um job de delay 0 pode rodar em menos
    // de 10ms — mais rápido que a escrita de `status: 'running'`. Se
    // `scheduleRun` for chamado ANTES dessa escrita, o job lê `draft`,
    // desiste pra sempre, e a publicação "some" (bug real reportado pelo
    // fundador: a etapa 0, sem escalonamento, nunca saiu). O teste finge
    // ser esse job: ele espia `dispatcher.scheduleRun` e, no MOMENTO da
    // chamada, confere no repositório que o status já é `running`.
    it('grava status=running ANTES de agendar qualquer etapa (nunca depois) — evita a corrida do delay 0', async () => {
      const { service, repository, dispatcher } = buildSut();
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });
      const statusSeenAtScheduleTime: string[] = [];
      const originalScheduleRun = dispatcher.scheduleRun.bind(dispatcher);
      dispatcher.scheduleRun = async (...args) => {
        const broadcast = await repository.findById('tenant-1', broadcastId);
        statusSeenAtScheduleTime.push(broadcast!.status);
        return originalScheduleRun(...args);
      };

      await service.startBroadcast('tenant-1', broadcastId);

      expect(statusSeenAtScheduleTime).toEqual(['running']);
    });

    it('N publicações, sem escalonamento configurado: todas agendam com delay 0 (começam juntas)', async () => {
      const { service, repository, dispatcher } = buildSut();
      const { broadcastId, stepIds } = repository.seedBroadcast({
        tenantId: 'tenant-1',
        groupJids: ['a@g.us'],
        extraSteps: [{ messageTemplate: 'Post 2' }, { messageTemplate: 'Post 3' }],
      });

      await service.startBroadcast('tenant-1', broadcastId);

      expect(dispatcher.runs.map((r) => ({ stepId: r.stepId, delayMs: r.delayMs }))).toEqual([
        { stepId: stepIds[0], delayMs: 0 },
        { stepId: stepIds[1], delayMs: 0 },
        { stepId: stepIds[2], delayMs: 0 },
      ]);
    });

    it('N publicações COM escalonamento: cada etapa espera order × minutos além da anterior', async () => {
      const { service, repository, dispatcher } = buildSut();
      const { broadcastId, stepIds } = repository.seedBroadcast({
        tenantId: 'tenant-1',
        groupJids: ['a@g.us'],
        stepLaunchOffsetMinutes: 10,
        extraSteps: [{ messageTemplate: 'Post 2' }, { messageTemplate: 'Post 3' }],
      });

      await service.startBroadcast('tenant-1', broadcastId);

      const delaysByStep = new Map(dispatcher.runs.map((r) => [r.stepId, r.delayMs]));
      expect(delaysByStep.get(stepIds[0])).toBe(0);
      expect(delaysByStep.get(stepIds[1])).toBe(10 * 60 * 1000);
      expect(delaysByStep.get(stepIds[2])).toBe(20 * 60 * 1000);
    });

    it('Plano Grátis não dispara (mesma trava de campanha)', async () => {
      const { service, repository } = buildSut({ plan: 'free' });
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });
      await expect(service.startBroadcast('tenant-1', broadcastId)).rejects.toBeInstanceOf(
        GroupBroadcastRequiresPaidPlanError,
      );
    });

    it('sem motor de envio (modo degradado): GroupBroadcastEngineNotConfiguredError', async () => {
      const { service, repository } = buildSut({ withDispatcher: false });
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });
      await expect(service.startBroadcast('tenant-1', broadcastId)).rejects.toBeInstanceOf(
        GroupBroadcastEngineNotConfiguredError,
      );
    });

    it('permite iniciar mesmo com outro disparo já em andamento na MESMA sessão (2026-09-12: sem trava/fila por pedido do fundador)', async () => {
      const { service, repository, dispatcher } = buildSut();
      repository.seedBroadcast({ tenantId: 'tenant-1', sessionName: 'sessao', status: 'running' });
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1', sessionName: 'sessao' });

      await expect(service.startBroadcast('tenant-1', broadcastId)).resolves.toMatchObject({
        status: 'running',
      });
      expect(dispatcher.runs.length).toBeGreaterThan(0);
    });

    it('outro disparo rodando em OUTRA sessão também não bloqueia', async () => {
      const { service, repository } = buildSut();
      repository.seedBroadcast({ tenantId: 'tenant-1', sessionName: 'outra', status: 'running' });
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1', sessionName: 'sessao' });
      await expect(service.startBroadcast('tenant-1', broadcastId)).resolves.toMatchObject({
        status: 'running',
      });
    });

    it('retomar UMA ETAPA já iniciada, pausada no meio de um envio: reagenda só os pendentes DELA', async () => {
      const { service, repository, dispatcher } = buildSut();
      const { broadcastId, stepTargetIds } = repository.seedBroadcast({
        tenantId: 'tenant-1',
        status: 'paused',
        groupJids: ['a@g.us', 'b@g.us'],
        startedAt: new Date(), // já rodou antes — não é mais o 1º start
      });
      repository.forceStepTarget(stepTargetIds[0][0], { status: 'sent', attemptedAt: new Date() });

      await service.startBroadcast('tenant-1', broadcastId);

      expect(dispatcher.scheduled.map((s) => s.stepTargetId)).toEqual([stepTargetIds[0][1]]);
      expect(dispatcher.runs).toHaveLength(0);
    });

    it('retomar uma etapa já iniciada, mas ENTRE ciclos (nada pendente agora): agenda o próximo run de imediato', async () => {
      const { service, repository, dispatcher } = buildSut();
      const { broadcastId, stepIds, stepTargetIds } = repository.seedBroadcast({
        tenantId: 'tenant-1',
        status: 'paused',
        groupJids: ['a@g.us'],
        startedAt: new Date(),
        runsCompleted: 1,
      });
      // O ciclo anterior já terminou (todo alvo `sent`), aguardando a
      // próxima repetição — nada `pending` agora, mas a etapa NÃO é nova.
      repository.forceStepTarget(stepTargetIds[0][0], { status: 'sent', attemptedAt: new Date() });

      await service.startBroadcast('tenant-1', broadcastId);

      expect(dispatcher.runs).toEqual([
        { tenantId: 'tenant-1', broadcastId, stepId: stepIds[0], runNumber: 2, delayMs: 0 },
      ]);
      expect(dispatcher.scheduled).toHaveLength(0);
    });

    it('1º início, todos os grupos suprimidos: encerra a etapa direto (sem agendar run) e completa a campanha', async () => {
      const { service, repository, dispatcher } = buildSut();
      const { broadcastId, stepTargetIds } = repository.seedBroadcast({ tenantId: 'tenant-1' });
      repository.forceStepTarget(stepTargetIds[0][0], {
        status: 'skipped',
      });

      const broadcast = await service.startBroadcast('tenant-1', broadcastId);

      expect(broadcast.status).toBe('completed');
      expect(dispatcher.scheduled).toHaveLength(0);
      expect(dispatcher.runs).toHaveLength(0);
      const [step] = await repository.listSteps('tenant-1', broadcastId);
      expect(step.finishedAt).toBeInstanceOf(Date);
    });

    it('status terminal não pode ser iniciado', async () => {
      const { service, repository } = buildSut();
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1', status: 'completed' });
      await expect(service.startBroadcast('tenant-1', broadcastId)).rejects.toBeInstanceOf(
        InvalidGroupBroadcastTransitionError,
      );
    });
  });

  describe('pause/cancel/delete', () => {
    it('pausa só o que está running', async () => {
      const { service, repository } = buildSut();
      const running = repository.seedBroadcast({ tenantId: 'tenant-1', status: 'running' });
      const draft = repository.seedBroadcast({ tenantId: 'tenant-1', status: 'draft' });

      await expect(service.pauseBroadcast('tenant-1', running.broadcastId)).resolves.toMatchObject({
        status: 'paused',
        pausedReason: 'paused_manually',
      });
      await expect(service.pauseBroadcast('tenant-1', draft.broadcastId)).rejects.toBeInstanceOf(
        InvalidGroupBroadcastTransitionError,
      );
    });

    it('cancela e registra na auditoria; cancelado não pode ser cancelado de novo', async () => {
      const { service, repository, audit } = buildSut();
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1', status: 'running' });

      await expect(service.cancelBroadcast('tenant-1', broadcastId)).resolves.toMatchObject({
        status: 'cancelled',
      });
      expect(audit.entries.map((e) => e.action)).toEqual(['group_broadcast.cancelled']);
      await expect(service.cancelBroadcast('tenant-1', broadcastId)).rejects.toBeInstanceOf(
        InvalidGroupBroadcastTransitionError,
      );
    });

    it('não exclui um disparo em andamento', async () => {
      const { service, repository } = buildSut();
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1', status: 'running' });
      await expect(service.deleteBroadcast('tenant-1', broadcastId)).rejects.toBeInstanceOf(
        InvalidGroupBroadcastTransitionError,
      );
    });
  });

  describe('mídia por etapa (2026-09-14)', () => {
    it('anexa imagem em rascunho', async () => {
      const { service, repository } = buildSut();
      const { broadcastId, stepIds } = repository.seedBroadcast({ tenantId: 'tenant-1' });

      const step = await service.attachMedia('tenant-1', broadcastId, stepIds[0], {
        contentType: 'image',
        buffer: PNG_BYTES,
        mimeType: 'image/png',
        fileName: 'promo.png',
      });

      expect(step.media).toEqual({
        contentType: 'image',
        mimeType: 'image/png',
        fileName: 'promo.png',
      });
      const media = await service.getMedia('tenant-1', broadcastId, stepIds[0]);
      expect(media.buffer.equals(PNG_BYTES)).toBe(true);
    });

    it('anexa mídia à etapa certa, sem afetar as demais', async () => {
      const { service } = buildSut();
      const created = await service.createBroadcast({
        ...baseInput,
        groupJids: ['aberto@g.us'],
        steps: [{ messageTemplate: 'Post 1' }, { messageTemplate: 'Post 2' }],
      });
      const [step0, step1] = created.steps;

      const updatedStep = await service.attachMedia('tenant-1', created.broadcast.id, step0.id, {
        contentType: 'image',
        buffer: PNG_BYTES,
        mimeType: 'image/png',
        fileName: 'a.png',
      });

      expect(updatedStep.media?.mimeType).toBe('image/png');
      const reloaded = await service.getBroadcast('tenant-1', created.broadcast.id);
      expect(reloaded.steps.find((s) => s.id === step1.id)?.media).toBeUndefined();
    });

    it('etapa de outra campanha (ou inexistente): GroupBroadcastStepNotFoundError', async () => {
      const { service, repository } = buildSut();
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });
      const other = repository.seedBroadcast({ tenantId: 'tenant-1' });

      await expect(
        service.attachMedia('tenant-1', broadcastId, other.stepIds[0], {
          contentType: 'image',
          buffer: PNG_BYTES,
          mimeType: 'image/png',
        }),
      ).rejects.toBeInstanceOf(GroupBroadcastStepNotFoundError);
    });

    it('vídeo aceita até 16MB; imagem acima de 5MB é recusada', async () => {
      const { service, repository } = buildSut();
      const { broadcastId, stepIds } = repository.seedBroadcast({ tenantId: 'tenant-1' });
      const sixMb = Buffer.concat([MP4_BYTES, Buffer.alloc(6 * 1024 * 1024)]);

      await expect(
        service.attachMedia('tenant-1', broadcastId, stepIds[0], {
          contentType: 'video',
          buffer: sixMb,
          mimeType: 'video/mp4',
        }),
      ).resolves.toBeDefined();

      const bigImage = Buffer.concat([PNG_BYTES, Buffer.alloc(6 * 1024 * 1024)]);
      await expect(
        service.attachMedia('tenant-1', broadcastId, stepIds[0], {
          contentType: 'image',
          buffer: bigImage,
          mimeType: 'image/png',
        }),
      ).rejects.toBeInstanceOf(GroupBroadcastMediaTooLargeError);
    });

    it('recusa arquivo cuja assinatura contradiz a categoria declarada', async () => {
      const { service, repository } = buildSut();
      const { broadcastId, stepIds } = repository.seedBroadcast({ tenantId: 'tenant-1' });
      await expect(
        service.attachMedia('tenant-1', broadcastId, stepIds[0], {
          contentType: 'video',
          buffer: PNG_BYTES,
          mimeType: 'video/mp4',
        }),
      ).rejects.toBeInstanceOf(GroupBroadcastMediaTypeMismatchError);
    });

    it('só em rascunho: disparo já iniciado não troca de conteúdo', async () => {
      const { service, repository } = buildSut();
      const { broadcastId, stepIds } = repository.seedBroadcast({
        tenantId: 'tenant-1',
        status: 'running',
      });
      await expect(
        service.attachMedia('tenant-1', broadcastId, stepIds[0], {
          contentType: 'image',
          buffer: PNG_BYTES,
          mimeType: 'image/png',
        }),
      ).rejects.toBeInstanceOf(InvalidGroupBroadcastTransitionError);
    });

    it('sem mídia: getMedia lança GroupBroadcastMediaNotFoundError', async () => {
      const { service, repository } = buildSut();
      const { broadcastId, stepIds } = repository.seedBroadcast({ tenantId: 'tenant-1' });
      await expect(service.getMedia('tenant-1', broadcastId, stepIds[0])).rejects.toBeInstanceOf(
        GroupBroadcastMediaNotFoundError,
      );
    });
  });
});

describe('GroupBroadcastService — recorrência por etapa (2026-09-11, estendido em 2026-09-14)', () => {
  const recorrente = {
    ...baseInput,
    groupJids: ['aberto@g.us'],
    steps: [{ messageTemplate: 'Confira a promoção!', recurrenceIntervalHours: 2 }],
  };

  it('sem recorrência, os campos ficam vazios (publicação única)', async () => {
    const { service } = buildSut();

    const { steps } = await service.createBroadcast({
      ...baseInput,
      groupJids: ['aberto@g.us'],
    });

    expect(steps[0].recurrenceIntervalHours).toBeUndefined();
    expect(steps[0].runsCompleted).toBe(0);
  });

  it('grava intervalo, teto de repetições e janela', async () => {
    const { service } = buildSut();

    const { steps, broadcast } = await service.createBroadcast({
      ...baseInput,
      groupJids: ['aberto@g.us'],
      sendWindowStart: '08:00',
      sendWindowEnd: '20:00',
      steps: [
        { messageTemplate: 'Confira a promoção!', recurrenceIntervalHours: 2, recurrenceMaxRuns: 4 },
      ],
    });

    expect(steps[0]).toMatchObject({ recurrenceIntervalHours: 2, recurrenceMaxRuns: 4 });
    expect(broadcast).toMatchObject({ sendWindowStart: '08:00', sendWindowEnd: '20:00' });
  });

  it('intervalo fora da faixa é trazido para dentro dela (1h a 24h)', async () => {
    const { service } = buildSut();

    const { steps } = await service.createBroadcast({
      ...baseInput,
      groupJids: ['aberto@g.us'],
      steps: [{ messageTemplate: 'Confira a promoção!', recurrenceIntervalHours: 99 }],
    });

    expect(steps[0].recurrenceIntervalHours).toBe(24);
  });

  it('recusa número de repetições fora da faixa', async () => {
    const { service } = buildSut();

    await expect(
      service.createBroadcast({
        ...baseInput,
        groupJids: ['aberto@g.us'],
        steps: [{ messageTemplate: 'x', recurrenceIntervalHours: 2, recurrenceMaxRuns: 1 }],
      }),
    ).rejects.toThrow(InvalidRecurrenceError);
    await expect(
      service.createBroadcast({
        ...baseInput,
        groupJids: ['aberto@g.us'],
        steps: [{ messageTemplate: 'x', recurrenceIntervalHours: 2, recurrenceMaxRuns: 500 }],
      }),
    ).rejects.toThrow(InvalidRecurrenceError);
  });

  it('recusa data de término no passado', async () => {
    const { service } = buildSut();

    await expect(
      service.createBroadcast({
        ...baseInput,
        groupJids: ['aberto@g.us'],
        steps: [
          {
            messageTemplate: 'x',
            recurrenceIntervalHours: 2,
            recurrenceEndsAt: new Date(Date.now() - 60000),
          },
        ],
      }),
    ).rejects.toThrow(InvalidRecurrenceError);
  });

  it('recusa janela pela metade ou de duração zero', async () => {
    const { service } = buildSut();

    await expect(
      service.createBroadcast({ ...recorrente, sendWindowStart: '08:00' }),
    ).rejects.toThrow(InvalidRecurrenceError);
    await expect(
      service.createBroadcast({
        ...recorrente,
        sendWindowStart: '08:00',
        sendWindowEnd: '08:00',
      }),
    ).rejects.toThrow(InvalidRecurrenceError);
  });
});
