import { ContactAvatarSource } from '../domain/providers/ContactAvatarSource';
import { WhatsAppConnectionRegistry } from '../application/WhatsAppConnectionRegistry';

/**
 * Implementação de `ContactAvatarSource` sobre o registry de conexões
 * (Bloco B2, issue #13) — o único lugar deste bounded context autorizado a
 * falar com o socket (ADR #54).
 *
 * Usa `peek`, NÃO `getOrCreate`: atualizar um cache auxiliar jamais pode
 * INSTANCIAR uma sessão de WhatsApp que não estava de pé. Sem instância
 * viva, devolve `undefined` — que o `ContactAvatarService` grava como
 * registro negativo com validade curta e reconsulta depois, quando a sessão
 * provavelmente já estará conectada.
 */
export class RegistryContactAvatarSource implements ContactAvatarSource {
  constructor(private readonly registry: WhatsAppConnectionRegistry) {}

  async fetchAvatarUrl(
    tenantId: string,
    sessionName: string,
    contactJid: string,
  ): Promise<string | undefined> {
    const sessionManager = this.registry.peek(tenantId, sessionName);
    if (!sessionManager) return undefined;
    // `getProfilePictureUrl` já tem timeout próprio de 6s e nunca lança
    // (ADR #78) — nenhum tratamento extra é necessário aqui.
    return sessionManager.getProfilePictureUrl(contactJid);
  }
}
