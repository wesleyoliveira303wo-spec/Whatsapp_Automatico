import { WhatsAppGroupDirectory } from '../../../../src/services/whatsapp/infrastructure/WhatsAppGroupDirectory';
import { WhatsAppGroupDirectoryService } from '../../../../src/services/whatsapp/application/WhatsAppGroupDirectoryService';
import { WhatsAppNotConnectedError } from '../../../../src/services/whatsapp/domain/errors/WhatsAppNotConnectedError';
import { WhatsAppGroupsFetchTimeoutError } from '../../../../src/services/whatsapp/domain/errors/WhatsAppGroupsFetchTimeoutError';
import { GroupDirectoryUnavailableError } from '../../../../src/services/groupBroadcasts/domain/errors/groupBroadcastErrors';

function fakeDirectoryService(
  impl: WhatsAppGroupDirectoryService['listGroups'],
): WhatsAppGroupDirectoryService {
  return { listGroups: impl } as unknown as WhatsAppGroupDirectoryService;
}

/**
 * Adapter `WhatsAppGroupDirectory` (`services/whatsapp/infrastructure`) —
 * traduz os erros do bounded context `whatsapp` para o vocabulário do
 * consumidor (`services/groupBroadcasts`), sem nunca vazar um erro de
 * `whatsapp` para fora deste arquivo.
 */
describe('WhatsAppGroupDirectory (Disparos em grupos, 2026-09-11)', () => {
  it('mapeia o snapshot para o formato do GroupDirectory (subconjunto de campos)', async () => {
    const service = fakeDirectoryService(async () => ({
      fetchedAt: new Date(),
      groups: [
        {
          jid: '111@g.us',
          name: 'Grupo 1',
          participantCount: 5,
          announce: true,
          isAdmin: true,
          canSend: true,
        },
      ],
    }));
    const directory = new WhatsAppGroupDirectory(service);

    const entries = await directory.listGroups('tenant-1', 'default');

    expect(entries).toEqual([
      { jid: '111@g.us', name: 'Grupo 1', participantCount: 5, canSend: true },
    ]);
  });

  it('traduz WhatsAppNotConnectedError para GroupDirectoryUnavailableError("not_connected")', async () => {
    const service = fakeDirectoryService(async () => {
      throw new WhatsAppNotConnectedError('tenant-1', 'default');
    });
    const directory = new WhatsAppGroupDirectory(service);

    await expect(directory.listGroups('tenant-1', 'default')).rejects.toThrow(
      GroupDirectoryUnavailableError,
    );
    try {
      await directory.listGroups('tenant-1', 'default');
      fail('deveria ter lançado');
    } catch (error) {
      expect((error as GroupDirectoryUnavailableError).reason).toBe('not_connected');
    }
  });

  it('traduz WhatsAppGroupsFetchTimeoutError para GroupDirectoryUnavailableError("timeout")', async () => {
    const service = fakeDirectoryService(async () => {
      throw new WhatsAppGroupsFetchTimeoutError('tenant-1', 'default', 15_000);
    });
    const directory = new WhatsAppGroupDirectory(service);

    try {
      await directory.listGroups('tenant-1', 'default');
      fail('deveria ter lançado');
    } catch (error) {
      expect(error).toBeInstanceOf(GroupDirectoryUnavailableError);
      expect((error as GroupDirectoryUnavailableError).reason).toBe('timeout');
    }
  });

  it('propaga qualquer outro erro sem traduzir (ex.: TenantNotFoundError)', async () => {
    const boom = new Error('erro inesperado');
    const service = fakeDirectoryService(async () => {
      throw boom;
    });
    const directory = new WhatsAppGroupDirectory(service);

    await expect(directory.listGroups('tenant-1', 'default')).rejects.toBe(boom);
  });
});
