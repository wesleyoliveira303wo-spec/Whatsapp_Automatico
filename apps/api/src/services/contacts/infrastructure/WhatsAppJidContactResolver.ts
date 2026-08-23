import { ContactResolver } from '../../conversations/domain/repositories/ContactResolver';
import { Logger } from '../../../shared/domain/Logger';
import { phoneFromWhatsAppJid } from '../domain/phoneNumber';
import { ContactRepository } from '../domain/repositories/ContactRepository';

/**
 * Implementa `ContactResolver` (porta de `services/conversations`) traduzindo
 * um JID do WhatsApp na identidade durável da pessoa — Fase L, Bloco L1.
 *
 * Vive em `services/contacts` (o contexto DONO da identidade), não em
 * `services/conversations` — a direção de dependência correta: quem
 * implementa uma porta é o lado que sabe fazer o trabalho, e quem a declara é
 * o lado que precisa dela. Mesma disposição de `WhatsAppMediaDownloader`, que
 * implementa em `services/whatsapp` uma porta declarada em
 * `services/conversations`.
 *
 * NUNCA LANÇA. Toda falha vira `undefined` + log, pelo mesmo motivo já
 * registrado em `getProfilePictureUrl`/`downloadMedia`: identidade de contato
 * é dado AUXILIAR, e uma indisponibilidade momentânea do banco não pode
 * impedir uma mensagem de cliente de ser recebida e respondida.
 */
export class WhatsAppJidContactResolver implements ContactResolver {
  constructor(
    private readonly contactRepository: ContactRepository,
    private readonly logger: Logger,
  ) {}

  async resolveByWhatsAppJid(tenantId: string, contactJid: string): Promise<string | undefined> {
    const phoneE164 = phoneFromWhatsAppJid(contactJid);
    if (!phoneE164) {
      // Caso normal e frequente (LID, grupo, canal) — `debug`, nunca `warn`:
      // ausência de telefone é o esperado nesses endereços, não uma anomalia.
      this.logger.debug('Sem identidade de contato a resolver para este endereço', {
        tenantId,
        contactJid,
      });
      return undefined;
    }

    try {
      const contact = await this.contactRepository.findOrCreateByPhone({
        tenantId,
        phoneE164,
        // Sem `name`: quem cria aqui é o sistema, a partir de uma mensagem
        // recebida — ninguém escolheu nome nenhum. O `pushName` continua onde
        // sempre esteve, em `Conversation.contactName`; `Contact.name` é
        // reservado ao nome que o OPERADOR der ao lead (ver `Contact`).
        source: 'whatsapp',
      });
      return contact.id;
    } catch (error) {
      this.logger.warn('Falha ao resolver identidade de contato', {
        tenantId,
        contactJid,
        error,
      });
      return undefined;
    }
  }

  /**
   * Ver docstring do método na porta (`ContactResolver.saveName`) — PROPAGA
   * erros de propósito (ação humana explícita), diferente de
   * `resolveByWhatsAppJid`.
   */
  async saveName(tenantId: string, contactId: string, name: string): Promise<void> {
    await this.contactRepository.update(tenantId, contactId, { name });
  }
}
