import { WhatsAppSession } from '../entities/WhatsAppSession';

export interface WhatsAppSessionRepository {
  update(id: string, data: Partial<WhatsAppSession>): Promise<void>;
  findById(id: string): Promise<WhatsAppSession | null>;

  /**
   * Busca a sessão lógica única de um tenant (ver `@@unique([tenantId,
   * sessionName])` em `prisma/schema.prisma`). É o finder que a Application
   * deve usar para decidir entre reaproveitar/atualizar uma sessão existente
   * ou criar uma nova — nunca via um `findAll()` global, que não escala e
   * não respeita o isolamento por tenant (ver nota abaixo sobre `create()`/
   * `findAll()`, removidos nesta Milestone).
   */
  findByTenantAndSessionName(tenantId: string, sessionName: string): Promise<WhatsAppSession | null>;

  /**
   * Lista todas as sessões de UM tenant (M2, Fase 1 — suporte à tela de
   * lista de sessões do Dashboard). Deliberadamente escopada por
   * `tenantId` desde a assinatura — substitui o antigo `findAll()` global
   * (removido nesta Milestone por auditoria: não tinha nenhum chamador em
   * produção e, sem escopo de tenant, era um vazamento de dados
   * cross-tenant esperando um consumidor descuidado acontecer).
   */
  findAllByTenant(tenantId: string): Promise<WhatsAppSession[]>;

  /**
   * Remove definitivamente o registro de uma sessão (M2, Fase 1 — suporte à
   * ação "remover sessão" do Dashboard, distinta de "desconectar":
   * desconectar mantém o registro para reconexão futura; remover apaga o
   * histórico de estado atual por completo). Implementações DEVEM ser
   * idempotentes — chamar para uma sessão já removida não deve lançar
   * (mesmo padrão já usado em `CredentialsStore.remove()`/`disconnect()`).
   */
  deleteByTenantAndSessionName(tenantId: string, sessionName: string): Promise<void>;

  /**
   * Cria a sessão lógica (`tenantId`+`sessionName`) se ainda não existir, ou
   * aplica `update` se já existir — operação atômica no nível do banco
   * (implementações reais devem usar um `upsert` real, ex.: `INSERT ...
   * ON CONFLICT DO UPDATE` no Postgres via `@@unique([tenantId,
   * sessionName])`).
   *
   * Corrige o P6 (auditoria de 2026-07-06, ver DECISIONS.md ADR #25): o
   * padrão anterior — `findByTenantAndSessionName` seguido de `create()` ou
   * `update()` na Application — tinha uma janela de corrida (TOCTOU) entre
   * a leitura e a escrita. Duas chamadas concorrentes de `init()` para a
   * MESMA sessão lógica podiam colidir na constraint de unicidade,
   * derrubando uma delas com uma exceção não tratada. Com esta operação
   * atômica, a chamada que "perde" a corrida recebe de volta a MESMA linha
   * que a vencedora já criou (via o ramo `update`), nunca duplicando nem
   * lançando.
   *
   * Retorna a sessão resultante (id definitivo — pode não ser o mesmo `id`
   * sugerido em `create`, se outra chamada concorrente já tiver inserido a
   * linha primeiro). Chamadores devem sempre usar o `id` do retorno, nunca
   * assumir que é o mesmo passado em `create`.
   */
  upsertByTenantAndSessionName(
    tenantId: string,
    sessionName: string,
    create: WhatsAppSession,
    update: Partial<WhatsAppSession>,
  ): Promise<WhatsAppSession>;
}
