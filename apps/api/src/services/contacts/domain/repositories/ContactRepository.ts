import { Contact, ContactSource } from '../entities/Contact';

/** Dados de criação de um contato. `id`/`updatedAt` são do repositório. */
export interface CreateContactData {
  tenantId: string;
  phoneE164: string;
  name?: string;
  source: ContactSource;
  /**
   * Quando esta pessoa entrou na base. Omitido no fluxo normal (o banco usa
   * `now()`), porque quem cria é a mensagem que acabou de chegar.
   *
   * Existe para o BACKFILL do histórico (`scripts/backfillContacts.ts`): lá o
   * contato nasce a partir de uma conversa que já existia, e a data que
   * interessa é a da PRIMEIRA conversa daquela pessoa — não o instante em que
   * o script rodou. Sem isso, toda a base histórica fica com a mesma data e
   * hora (o momento da migração), o que é visivelmente inútil na tela de
   * Contatos.
   */
  createdAt?: Date;
}

/** Opções de listagem paginada — mesmo formato de `ListAuditLogsOptions` (cursor por id, limit obrigatório). */
export interface ListContactsOptions {
  limit: number;
  cursor?: string;
  /** Filtro por texto livre (nome OU telefone) — Bloco L1b, tela "Leads". */
  search?: string;
}

/** Página de resultado — `nextCursor` ausente indica fim, mesmo contrato de `AuditLogPage`. */
export interface ContactPage {
  contacts: Contact[];
  nextCursor?: string;
}

/**
 * Porta (port) de persistência de contatos — Fase L, Blocos L1/L1b.
 *
 * `listByTenant`/`setNameIfMissing` nasceram no L1b (importação de planilha),
 * não no L1 — mesma disciplina de YAGNI já registrada aqui: só o que o bloco
 * em execução precisa.
 */
export interface ContactRepository {
  /**
   * Encontra o contato pelo telefone canônico, ou cria um novo se ainda não
   * existir — a operação central da deduplicação.
   *
   * ATÔMICA por construção: apoia-se no `@@unique([tenantId, phoneE164])` do
   * banco, não numa sequência "buscar depois inserir" feita na aplicação
   * (mesmo racional de `ConversationRepository.upsertByTenantSessionAndContact`,
   * ADR #25/P6). Isso importa porque duas mensagens da mesma pessoa chegando
   * quase juntas executam este método em paralelo, e uma verificação em duas
   * etapas criaria dois contatos ou estouraria a constraint.
   *
   * NUNCA sobrescreve um contato existente: se a pessoa já está cadastrada, os
   * dados dela são devolvidos como estão. Em especial, um `name` já definido
   * pelo operador jamais é substituído por um valor vindo de uma criação
   * automática — quem escolheu o nome foi uma pessoa, e um evento de sistema
   * não pode desfazer isso.
   */
  findOrCreateByPhone(data: CreateContactData): Promise<Contact>;

  /** Busca pelo telefone canônico. `undefined` quando não existe. */
  findByPhone(tenantId: string, phoneE164: string): Promise<Contact | undefined>;

  /** Busca por id, escopada ao tenant (nunca devolve contato de outro tenant). */
  findById(tenantId: string, contactId: string): Promise<Contact | undefined>;

  /**
   * Preenche `name` de um contato que AINDA NÃO TEM nome — usado pela
   * importação de planilha para dar nome a contatos criados automaticamente
   * pelo WhatsApp (a esmagadora maioria dos contatos hoje: eles nascem sem
   * nome, porque quem os cria é uma mensagem recebida, não uma pessoa).
   *
   * SÓ PREENCHE, NUNCA SOBRESCREVE (mesmo padrão de `linkContact` em
   * `ConversationRepository`): implementações devem incluir `name: null` no
   * critério de busca. Reimportar a mesma planilha, ou importar uma segunda
   * lista que cita a mesma pessoa com um nome diferente, nunca apaga um nome
   * já definido — seja ele de uma importação anterior ou de uma edição manual
   * futura. `source` original NUNCA muda aqui: representa como o contato
   * ENTROU no sistema pela primeira vez, não a última operação sobre ele.
   *
   * Não-op silencioso se o contato não existir/não pertencer ao tenant/já
   * tiver nome — mesmo espírito de `incrementUnreadCount`.
   */
  setNameIfMissing(tenantId: string, contactId: string, name: string): Promise<void>;

  /**
   * Lista contatos do tenant, paginado por cursor (ver `ListContactsOptions`).
   * Ordenado por `createdAt` decrescente (mais recentes primeiro) — mesma
   * convenção de listagens recentes deste projeto.
   */
  listByTenant(tenantId: string, options: ListContactsOptions): Promise<ContactPage>;
}
