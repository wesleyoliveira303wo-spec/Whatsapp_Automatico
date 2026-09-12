import { Logger } from '../../../shared/domain/Logger';
import { ContactAvatarService } from '../application/ContactAvatarService';
import { OwnAvatarRefresher } from '../domain/providers/OwnAvatarRefresher';

/**
 * Implementa `OwnAvatarRefresher` sobre o `ContactAvatarService` já existente
 * (2026-09-12) — o número da própria sessão é só mais um JID para ele, no
 * mesmo formato que `ContactAvatar`/`WhatsAppAccountCard` já usam desde
 * 2026-08-07 (`${phoneNumber}@s.whatsapp.net`). Fica em `infrastructure`
 * (não em `application`, junto de `ContactAvatarService`) porque é
 * `SessionManager` quem consome — mesmo motivo de outras portas estreitas do
 * projeto (`ContactResolver`, `AiAvailabilityRepository`): uma classe que já
 * existe ganhando uma segunda interface pequena, sem o consumidor precisar
 * conhecê-la por inteiro.
 */
export class SessionOwnAvatarRefresher implements OwnAvatarRefresher {
  constructor(
    private readonly contactAvatarService: ContactAvatarService,
    private readonly logger: Logger,
  ) {}

  async ensureOwnAvatarQueued(
    tenantId: string,
    sessionName: string,
    phoneNumber: string,
  ): Promise<void> {
    try {
      await this.contactAvatarService.ensureAvatarQueued(
        tenantId,
        sessionName,
        `${phoneNumber}@s.whatsapp.net`,
      );
    } catch (error) {
      this.logger.debug('Falha ao enfileirar a foto de perfil da própria sessão', {
        tenantId,
        sessionName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
