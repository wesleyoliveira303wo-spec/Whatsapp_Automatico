import { GroupBroadcastSendJobProcessor } from '../../../../src/services/groupBroadcasts/infrastructure/GroupBroadcastSendJobProcessor';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import {
  FakeGroupBroadcastRepository,
  FakeGroupMessageSender,
} from '../fakes';

function buildSut(): {
  processor: GroupBroadcastSendJobProcessor;
  repository: FakeGroupBroadcastRepository;
  sender: FakeGroupMessageSender;
} {
  const repository = new FakeGroupBroadcastRepository();
  const sender = new FakeGroupMessageSender();
  const processor = new GroupBroadcastSendJobProcessor(repository, sender, new NoopLogger());
  return { processor, repository, sender };
}

describe('GroupBroadcastSendJobProcessor (Disparos em grupos, 2026-09-11)', () => {
  it('envia e marca o alvo como sent', async () => {
    const { processor, repository, sender } = buildSut();
    const { broadcastId, targetIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      sessionName: 'sessao',
      status: 'running',
      groupJids: ['111@g.us'],
      messageTemplate: 'Promoção!',
    });

    await processor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[0] });

    const target = await repository.findTargetById('tenant-1', targetIds[0]);
    expect(target?.status).toBe('sent');
    expect(target?.attemptedAt).toBeInstanceOf(Date);
    expect(sender.calls).toEqual([
      {
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        groupJid: '111@g.us',
        content: 'Promoção!',
        media: undefined,
      },
    ]);
  });

  it('disparo com mídia anexada: busca o binário e repassa ao sender', async () => {
    const { processor, repository, sender } = buildSut();
    const { broadcastId, targetIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      sessionName: 'sessao',
      status: 'running',
      groupJids: ['111@g.us'],
    });
    await repository.attachMedia('tenant-1', broadcastId, {
      contentType: 'image',
      buffer: Buffer.from('bytes-da-imagem'),
      mimeType: 'image/jpeg',
      fileName: 'promo.jpg',
    });

    await processor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[0] });

    expect(sender.calls[0].media).toEqual({
      contentType: 'image',
      buffer: Buffer.from('bytes-da-imagem'),
      mimeType: 'image/jpeg',
      fileName: 'promo.jpg',
    });
  });

  it('disparo SEM mídia: sender recebe media=undefined', async () => {
    const { processor, repository, sender } = buildSut();
    const { broadcastId, targetIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'running',
      groupJids: ['111@g.us'],
    });

    await processor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[0] });

    expect(sender.calls[0].media).toBeUndefined();
  });

  it('disparo não RUNNING: não envia nada, alvo continua pending', async () => {
    const { processor, repository, sender } = buildSut();
    const { broadcastId, targetIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'paused',
      groupJids: ['111@g.us'],
    });

    await processor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[0] });

    expect(sender.calls).toHaveLength(0);
    const target = await repository.findTargetById('tenant-1', targetIds[0]);
    expect(target?.status).toBe('pending');
  });

  it('disparo inexistente: não lança, só não envia', async () => {
    const { processor, sender } = buildSut();

    await expect(
      processor.process({
        tenantId: 'tenant-1',
        broadcastId: 'disparo-fantasma',
        targetId: 'alvo-fantasma',
      }),
    ).resolves.toBeUndefined();
    expect(sender.calls).toHaveLength(0);
  });

  it('alvo já processado (SENT): idempotência — não reenvia', async () => {
    const { processor, repository, sender } = buildSut();
    const { broadcastId, targetIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'running',
      groupJids: ['111@g.us'],
    });
    repository.forceTarget(targetIds[0], { status: 'sent', sentAt: new Date() });

    await processor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[0] });

    expect(sender.calls).toHaveLength(0);
  });

  it('falha no envio: marca failed com o motivo, não sent', async () => {
    const { processor, repository, sender } = buildSut();
    const { broadcastId, targetIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'running',
      groupJids: ['111@g.us'],
    });
    sender.results.push({ ok: false, failureReason: 'erro_ao_enviar' });

    await processor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[0] });

    const target = await repository.findTargetById('tenant-1', targetIds[0]);
    expect(target?.status).toBe('failed');
    expect(target?.errorMessage).toBe('erro_ao_enviar');
    expect(target?.sentAt).toBeUndefined();
  });

  it('disjuntor: as DUAS últimas tentativas falharam → pausa automaticamente (mais sensível que o motor 1:1)', async () => {
    const { processor, repository, sender } = buildSut();
    const { broadcastId, targetIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'running',
      groupJids: ['111@g.us', '222@g.us', '333@g.us'],
    });
    // Primeira tentativa falha.
    sender.results.push({ ok: false, failureReason: 'erro' });
    await processor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[0] });
    let broadcast = await repository.findById('tenant-1', broadcastId);
    expect(broadcast?.status).toBe('running'); // 1 de 1 falha, mas amostra mínima é 2.

    // Segunda tentativa TAMBÉM falha → dispara o disjuntor.
    sender.results.push({ ok: false, failureReason: 'erro' });
    await processor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[1] });

    broadcast = await repository.findById('tenant-1', broadcastId);
    expect(broadcast?.status).toBe('paused');
    expect(broadcast?.pausedReason).toBe('consecutive_failures');
    // O terceiro alvo nunca foi tentado (só 2 chamadas ao sender).
    expect(sender.calls).toHaveLength(2);
  });

  it('uma falha isolada seguida de sucesso NÃO dispara o disjuntor', async () => {
    const { processor, repository, sender } = buildSut();
    const { broadcastId, targetIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'running',
      groupJids: ['111@g.us', '222@g.us'],
    });
    sender.results.push({ ok: false, failureReason: 'erro' });
    await processor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[0] });
    sender.results.push({ ok: true });
    await processor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[1] });

    const broadcast = await repository.findById('tenant-1', broadcastId);
    expect(broadcast?.status).toBe('completed');
  });

  it('sem mais pendentes após o envio: disparo vira completed', async () => {
    const { processor, repository } = buildSut();
    const { broadcastId, targetIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'running',
      groupJids: ['111@g.us'],
    });

    await processor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[0] });

    const broadcast = await repository.findById('tenant-1', broadcastId);
    expect(broadcast?.status).toBe('completed');
  });

  it('ainda há pendentes após o envio: disparo continua running', async () => {
    const { processor, repository } = buildSut();
    const { broadcastId, targetIds } = repository.seedBroadcast({
      tenantId: 'tenant-1',
      status: 'running',
      groupJids: ['111@g.us', '222@g.us'],
    });

    await processor.process({ tenantId: 'tenant-1', broadcastId, targetId: targetIds[0] });

    const broadcast = await repository.findById('tenant-1', broadcastId);
    expect(broadcast?.status).toBe('running');
  });
});
