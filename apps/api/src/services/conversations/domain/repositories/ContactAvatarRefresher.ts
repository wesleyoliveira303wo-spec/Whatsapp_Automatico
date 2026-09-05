/**
 * Porta ESTREITA para `services/conversations` pedir a foto de perfil de um
 * contato ao `services/whatsapp` sem conhecer aquele bounded context — mesmo
 * padrão e mesmo motivo de `ContactResolver`/`OptOutDetector`/
 * `AiAvailabilityRepository`.
 *
 * MUDANÇA DE GATILHO (2026-09-05, decisão do fundador). Antes, quem disparava
 * a busca de foto era a TELA: abrir Conversas pedia a foto de dezenas de
 * contatos de uma vez. Medido, isso não funciona — o WhatsApp atende as
 * primeiras consultas depois de conectar e então para de responder
 * (`"timed out waiting for message"` no próprio Baileys), então a rajada
 * gastava a cota logo no começo e quase tudo virava timeout.
 *
 * O gatilho passou a ser a MENSAGEM: quando um contato escreve, e só então,
 * a foto dele é buscada — se ainda não estiver no cache. Isso espalha as
 * consultas ao longo do dia, no ritmo real da operação, em vez de concentrar
 * tudo no instante em que alguém abre uma tela. Contatos antigos que nunca
 * mais escreverem simplesmente ficam sem foto, o que é aceitável: se a
 * pessoa não fala com a empresa, a foto dela não tem valor operacional.
 */
export interface ContactAvatarRefresher {
  /**
   * Garante que a foto deste contato esteja (ou entre) na fila de busca.
   * Não busca nada de forma síncrona e não devolve a foto: quem lê é a tela,
   * pelo cache. É só o empurrão que diz "este contato acabou de dar sinal de
   * vida, vale a pena ter a foto dele".
   *
   * NUNCA LANÇA — mesmo contrato dos demais ports auxiliares deste módulo.
   * Foto de perfil é adorno: uma falha aqui jamais pode impedir a mensagem
   * de ser recebida.
   */
  ensureAvatarQueued(tenantId: string, sessionName: string, contactJid: string): Promise<void>;
}
