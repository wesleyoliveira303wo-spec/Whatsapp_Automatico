import { Logger } from '../../../shared/domain/Logger';
import { ContactAvatarRefresher } from '../../conversations/domain/repositories/ContactAvatarRefresher';
import { ContactAvatarService } from '../application/ContactAvatarService';

/**
 * Implementa `ContactAvatarRefresher` (port de `services/conversations`)
 * sobre o `ContactAvatarService` — mesmo padrão de `CampaignReplyTrackerImpl`
 * e `ContactPhoneLookupImpl`: um adapter fino, no bounded context DONO da
 * capacidade, para o outro não precisar conhecê-lo.
 *
 * A disciplina de "NUNCA lança" mora aqui, não no serviço: quem ingere uma
 * mensagem de cliente não pode falhar porque uma foto de perfil deu erro.
 */
export class ContactAvatarRefresherImpl implements ContactAvatarRefresher {
  constructor(
    private readonly contactAvatarService: ContactAvatarService,
    private readonly logger: Logger,
  ) {}

  async ensureAvatarQueued(
    tenantId: string,
    sessionName: string,
    contactJid: string,
  ): Promise<void> {
    try {
      await this.contactAvatarService.ensureAvatarQueued(tenantId, sessionName, contactJid);
    } catch (error) {
      this.logger.debug('Falha ao enfileirar a foto de perfil do contato', {
        tenantId,
        sessionName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
