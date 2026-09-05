import {
  ContactAvatarLookup,
  ContactAvatarSource,
} from '../domain/providers/ContactAvatarSource';
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

  async lookup(
    tenantId: string,
    sessionName: string,
    contactJid: string,
  ): Promise<ContactAvatarLookup> {
    const sessionManager = this.registry.peek(tenantId, sessionName);
    // Sem instância viva não houve pergunta nenhuma — devolver "sem foto"
    // aqui marcaria TODO contato como sem foto por horas logo após qualquer
    // reinício do processo, que é justamente quando o registry está vazio.
    if (!sessionManager) return { checked: false, reason: 'session_not_live' };
    // `getProfilePictureUrl` já tem timeout próprio de 6s e nunca lança
    // (ADR #78) — nenhum tratamento extra é necessário aqui.
    const avatarUrl = await sessionManager.getProfilePictureUrl(contactJid);
    return { checked: true, avatarUrl };
  }
}
