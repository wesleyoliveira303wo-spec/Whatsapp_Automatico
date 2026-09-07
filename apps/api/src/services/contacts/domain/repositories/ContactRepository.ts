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

/**
 * Filtro rápido da tela de Contatos (retrofit visual 2026-08-17, réplica de
 * referência do fundador) — espelha as abas "Todos/Com conversa/Sem
 * conversa/Opt-outs". `undefined`/`'all'` = sem filtro.
 */
export type ContactStatusFilter = 'with_conversation' | 'without_conversation' | 'opted_out';

/** Opções de listagem paginada — mesmo formato de `ListAuditLogsOptions` (cursor por id, limit obrigatório). */
export interface ListContactsOptions {
  limit: number;
  cursor?: string;
  /** Filtro por texto livre (nome OU telefone) — Bloco L1b, tela "Leads". */
  search?: string;
  /** Aditivo (2026-08-17) — filtra por uma das abas da tela. */
  status?: ContactStatusFilter;
}

/**
 * Contato + um resumo da atividade dele — read model da TELA de Contatos
 * (retrofit 2026-08-16). Estende `Contact` de forma aditiva em vez de
 * poluir a entidade de Domain com dados de conversa: `Contact` continua
 * sendo só identidade (ver sua docstring); estes campos existem porque a
 * lista precisa mostrar "último contato" e oferecer "Abrir conversa" sem
 * uma consulta por linha (N+1).
 *
 * Todos opcionais: um contato importado de planilha que nunca escreveu não
 * tem conversa nenhuma — é justamente esse o "Sem conversa" dos cards.
 */
export interface ContactWithActivity extends Contact {
  /** Conversa mais recente desta pessoa, em QUALQUER sessão do tenant. */
  lastConversationId?: string;
  lastConversationSessionName?: string;
  /** `lastMessageAt` daquela conversa — a data real do último contato. */
  lastActivityAt?: Date;
  /**
   * Padronização de exibição de contato (2026-08-20) — apelido do WhatsApp
   * (`WhatsAppConversation.contactName`) capturado na conversa mais recente
   * desta pessoa, junto com o mesmo `include` que já resolve
   * `lastConversationId`. Ausente sem conversa nenhuma, ou se aquela
   * conversa nunca capturou um `pushName`. Serve para a tela de Contatos
   * mostrar "telefone + apelido" num contato ainda sem `name` salvo — mesma
   * regra de `formatContactDisplayName` (`apps/dashboard`).
   */
  lastConversationContactName?: string;
  /**
   * Bloco B2 (issue #13) — o JID daquela conversa, para a tela de Contatos
   * pedir a foto de perfil pelo MESMO identificador com que ela está no
   * cache. Deliberadamente não é derivado do telefone: um contato pode estar
   * salvo como `@lid` (endereço de privacidade), e um JID sintetizado a
   * partir do número não bateria com nada — pediria uma foto que ninguém
   * tem, gerando trabalho de fundo inútil.
   */
  lastConversationContactJid?: string;
}

/** Página de resultado — `nextCursor` ausente indica fim, mesmo contrato de `AuditLogPage`. */
export interface ContactPage {
  contacts: ContactWithActivity[];
  nextCursor?: string;
}

/**
 * Contagens da base inteira do tenant — os cards do topo da tela de
 * Contatos. Deliberadamente NÃO respeitam o filtro de busca: descrevem a
 * base, não a página que está na tela.
 */
export interface ContactStats {
  total: number;
  withConversation: number;
  withoutConversation: number;
  /** Aditivo (2026-08-17) — quantos contatos estão em opt-out agora. */
  optedOut: number;
  /** Aditivo (2026-08-18) — contagem por origem, para "Principais fontes" na tela de Contatos. */
  bySource: Record<ContactSource, number>;
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

  /**
   * Grava (ou limpa, com `at: null`) `optOutAt` — Fase L, Bloco L2.
   * Incondicional (não "só preenche"): diferente de `setNameIfMissing`, um
   * opt-out precisa poder ser revertido por um opt-in manual, e um novo
   * opt-out precisa atualizar a data mesmo que já houvesse uma anterior
   * (sustenta reconstruir a linha do tempo via `ConsentEvent`, que é o
   * registro append-only — este campo é só o estado ATUAL).
   *
   * Devolve o `Contact` atualizado, ou `undefined` (não lança) se não
   * existir/não pertencer ao tenant — mesmo padrão de `markAsRead` em
   * `ConversationRepository`.
   */
  setOptOutAt(tenantId: string, contactId: string, at: Date | null): Promise<Contact | undefined>;

  /**
   * Contagens da base do tenant para os cards da tela de Contatos
   * (retrofit 2026-08-16) — ver `ContactStats`.
   */
  countStats(tenantId: string): Promise<ContactStats>;

  /**
   * Busca vários contatos pelos telefones canônicos de uma vez — sustenta
   * `ContactLookupImpl` (Reorganização Contatos/Campanhas, 2026-08-17):
   * "destes telefones de uma planilha/lista manual, quais já são Contatos
   * conhecidos?". Telefones sem Contato simplesmente não aparecem no
   * resultado.
   */
  findManyByPhones(tenantId: string, phonesE164: string[]): Promise<Contact[]>;

  /**
   * Edita nome e/ou telefone de um contato já existente — Reorganização
   * Contatos/Campanhas (2026-08-17), a tela de Contatos vira um CRUD de
   * verdade. `undefined` num campo significa "não mexe nele" (mesma
   * convenção de `UpdateConversationStatusOptions`: presença da chave decide
   * se altera). Editar o telefone para um valor que já pertence a OUTRO
   * contato do mesmo tenant lança `ContactPhoneAlreadyExistsError` (a
   * constraint `@@unique([tenantId, phoneE164])` é quem garante isso).
   *
   * Devolve `undefined` (não lança) se o contato não existir/não pertencer
   * ao tenant — mesmo padrão de `setOptOutAt`.
   */
  update(
    tenantId: string,
    contactId: string,
    data: { name?: string; phoneE164?: string },
  ): Promise<Contact | undefined>;

  /**
   * Remove um contato definitivamente. Não tem `@relation`/FK para
   * `WhatsAppConversation`/`CampaignRecipient` (ver docstring dos models) —
   * apagar um contato nunca apaga histórico de conversa nem destinatários de
   * campanha já materializados; eles só deixam de ter um Contato vinculado.
   *
   * Devolve `true` se algo foi removido, `false` se o contato não
   * existia/não pertencia ao tenant.
   */
  deleteById(tenantId: string, contactId: string): Promise<boolean>;
}
