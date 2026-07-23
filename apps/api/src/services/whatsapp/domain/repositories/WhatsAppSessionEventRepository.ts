import { WhatsAppSessionEvent } from '../entities/WhatsAppSessionEvent';

/**
 * Porta (port) para o histórico append-only de transições de status de uma
 * sessão do WhatsApp — M2, Fase 2 (M2-B4). Ver docstring de
 * `WhatsAppSessionEvent` para o racional completo de ser uma entidade/tabela
 * separada de `WhatsAppSessionRepository`.
 *
 * Deliberadamente um port PRÓPRIO, não um método a mais em
 * `WhatsAppSessionRepository`: as duas interfaces têm razões de mudar
 * diferentes (uma é o estado atual de uma sessão; a outra é um log imutável
 * de transições) — misturá-las violaria o mesmo princípio (ISP/SRP) já
 * usado para justificar `CredentialsStore` como port separado de
 * `WhatsAppSessionRepository`.
 */
export interface WhatsAppSessionEventRepository {
  /**
   * Registra uma nova transição. `id`/`occurredAt` não são responsabilidade
   * do chamador — a implementação real (Prisma) gera o `id`; `occurredAt` é
   * fornecido pelo chamador (não `now()` no banco) porque `SessionManager`
   * já captura um único `Date` para todas as escritas do mesmo evento (ver
   * `subscribeToProviderEvents`), evitando qualquer divergência de
   * timestamp entre `WhatsAppSession.updatedAt` e este registro do mesmo
   * evento.
   */
  append(event: Omit<WhatsAppSessionEvent, 'id'>): Promise<void>;

  /**
   * Lista os eventos mais recentes de uma sessão lógica, do mais novo para
   * o mais antigo, limitado a `limit` registros — suporte direto à tela de
   * "histórico recente" do Dashboard (M2-B5), que nunca precisa da tabela
   * inteira de uma vez.
   */
  listRecentByTenantAndSessionName(tenantId: string, sessionName: string, limit: number): Promise<WhatsAppSessionEvent[]>;
}
