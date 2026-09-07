import { ContactAvatarCacheEntry } from '../policies/contactAvatarFreshness';

/** Uma linha do cache, já identificada pelo JID do contato. */
export interface ContactAvatarCacheRecord extends ContactAvatarCacheEntry {
  contactJid: string;
}

/**
 * Porta de persistência do cache de fotos de perfil (Bloco B2, issue #13).
 *
 * Deliberadamente EM LOTE na leitura: o consumidor é uma tela com dezenas de
 * linhas, e o objetivo do bloco inteiro é trocar "uma consulta por linha"
 * por "uma consulta por tela". Um `findOne` aqui convidaria de volta o
 * padrão que causou o incidente da ADR #78.
 */
export interface ContactAvatarCacheRepository {
  /**
   * Lê as entradas conhecidas para os JIDs pedidos. JID sem entrada
   * simplesmente não aparece no resultado (nunca foi checado) — quem chama
   * distingue isso de uma entrada com `avatarUrl` ausente ("checamos e não
   * tem foto"), que é informação de verdade.
   */
  findManyByContactJids(
    tenantId: string,
    sessionName: string,
    contactJids: string[],
  ): Promise<ContactAvatarCacheRecord[]>;

  /**
   * Grava o resultado de uma consulta ao WhatsApp. `avatarUrl` ausente é
   * gravado como registro negativo (linha presente, URL nula) — é o que
   * impede um contato sem foto de ser reconsultado a cada abertura de tela.
   */
  upsert(
    tenantId: string,
    sessionName: string,
    contactJid: string,
    avatarUrl: string | undefined,
    refreshedAt: Date,
  ): Promise<void>;
}
