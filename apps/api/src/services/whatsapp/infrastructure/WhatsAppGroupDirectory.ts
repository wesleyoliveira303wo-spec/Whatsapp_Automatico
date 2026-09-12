import {
  GroupDirectory,
  GroupDirectoryEntry,
} from '../../groupBroadcasts/domain/providers/GroupDirectory';
import { GroupDirectoryUnavailableError } from '../../groupBroadcasts/domain/errors/groupBroadcastErrors';
import { WhatsAppGroupDirectoryService } from '../application/WhatsAppGroupDirectoryService';
import { WhatsAppNotConnectedError } from '../domain/errors/WhatsAppNotConnectedError';
import { WhatsAppGroupsFetchTimeoutError } from '../domain/errors/WhatsAppGroupsFetchTimeoutError';

/**
 * Implementação real do port `GroupDirectory` (`services/groupBroadcasts`) —
 * Disparos em grupos (2026-09-11). Adapter fino sobre
 * `WhatsAppGroupDirectoryService`, reaproveitando o MESMO cache/deduplicação
 * que a tela usa: a lista que o operador acabou de ver na tela é a mesma
 * que o servidor usa para conferir os grupos na criação, sem uma consulta IQ
 * a mais no socket.
 *
 * Traduz os erros do bounded context `whatsapp` para o vocabulário do
 * consumidor (`GroupDirectoryUnavailableError`) — o serviço de disparos nunca
 * importa um erro de `whatsapp`.
 */
export class WhatsAppGroupDirectory implements GroupDirectory {
  constructor(private readonly directoryService: WhatsAppGroupDirectoryService) {}

  async listGroups(tenantId: string, sessionName: string): Promise<GroupDirectoryEntry[]> {
    try {
      const snapshot = await this.directoryService.listGroups(tenantId, sessionName);
      return snapshot.groups.map((group) => ({
        jid: group.jid,
        name: group.name,
        participantCount: group.participantCount,
        canSend: group.canSend,
      }));
    } catch (error) {
      if (error instanceof WhatsAppNotConnectedError) {
        throw new GroupDirectoryUnavailableError('not_connected');
      }
      if (error instanceof WhatsAppGroupsFetchTimeoutError) {
        throw new GroupDirectoryUnavailableError('timeout');
      }
      throw error;
    }
  }
}
