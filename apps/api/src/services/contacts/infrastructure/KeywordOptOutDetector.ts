import { OptOutDetector } from '../../conversations/domain/repositories/OptOutDetector';
import { Logger } from '../../../shared/domain/Logger';
import { isOptOutKeyword } from '../domain/optOutKeywords';
import { ContactConsentService } from '../application/ContactConsentService';

/**
 * Implementa `OptOutDetector` (porta de `services/conversations`) sobre
 * `isOptOutKeyword` + `ContactConsentService` — Fase L, Bloco L2. Vive em
 * `services/contacts` (o contexto DONO do consentimento), mesma disposição
 * de `WhatsAppJidContactResolver` para `ContactResolver`.
 *
 * NUNCA LANÇA — ver docstring da porta.
 */
export class KeywordOptOutDetector implements OptOutDetector {
  constructor(
    private readonly contactConsentService: ContactConsentService,
    private readonly logger: Logger,
  ) {}

  async detectAndRecord(tenantId: string, contactId: string, content: string): Promise<void> {
    if (!isOptOutKeyword(content)) {
      return;
    }

    try {
      await this.contactConsentService.recordOptOut(tenantId, contactId, 'palavra-chave');
    } catch (error) {
      this.logger.warn('Falha ao registrar opt-out automático por palavra-chave', {
        tenantId,
        contactId,
        error,
      });
    }
  }
}
