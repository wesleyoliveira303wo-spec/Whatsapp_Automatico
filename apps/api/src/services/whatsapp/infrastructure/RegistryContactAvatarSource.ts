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
/**
 * Teto de espera da atualização EM SEGUNDO PLANO — bem maior que os 6s que
 * protegem uma consulta com alguém esperando na tela.
 *
 * Escolhido a partir de medição, não de estimativa: com 6s, 72 de 81
 * consultas (89%) morriam por tempo e apenas 1 contato de fato não tinha
 * foto (log "Atualização de fotos de perfil concluída", 2026-09-05). O
 * WhatsApp simplesmente demora mais que isso para responder consulta de foto
 * quando o socket está sincronizando mensagens.
 *
 * Esticar o teto aqui é seguro justamente porque este caminho saiu de dentro
 * da requisição: ninguém espera por ele. A proteção que a ADR #78 pede
 * continua sendo o TETO DE CONCORRÊNCIA (2 por vez), que não muda — o socket
 * nunca fica com mais de duas consultas de foto simultâneas, dure o que
 * durar cada uma.
 */
const BACKGROUND_PROFILE_PICTURE_TIMEOUT_MS = 25_000;

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

    // Consulta INSTRUMENTADA (2026-09-05): distingue "não tem foto" de
    // "não voltou resposta". O timeout de 6s do provider continua valendo
    // (ADR #78) — a diferença é que agora ele não é mais confundido com
    // ausência de foto.
    const lookup = await sessionManager.lookupProfilePicture(
      contactJid,
      BACKGROUND_PROFILE_PICTURE_TIMEOUT_MS,
    );
    if (lookup.outcome === 'found') return { checked: true, avatarUrl: lookup.url };
    if (lookup.outcome === 'absent') return { checked: true, avatarUrl: undefined };
    return { checked: false, reason: lookup.reason === 'timeout' ? 'timeout' : 'session_not_live' };
  }
}
