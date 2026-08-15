import { Contact, ContactSource } from '../entities/Contact';

/** Dados de criação de um contato. `id`/`createdAt`/`updatedAt` são do repositório. */
export interface CreateContactData {
  tenantId: string;
  phoneE164: string;
  name?: string;
  source: ContactSource;
}

/**
 * Porta (port) de persistência de contatos — Fase L, Bloco L1.
 *
 * Deliberadamente pequena: só o que o Bloco L1 precisa. Listagem paginada,
 * busca por nome e edição entram junto com as telas que as consumirem
 * (importação de planilha e cadastro), não antes — mesma disciplina de YAGNI
 * já aplicada a `AiInteractionRepository` (que nasceu só com `record`/
 * `linkMessage`) e a `AiBusinessProfileRepository`.
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
}
