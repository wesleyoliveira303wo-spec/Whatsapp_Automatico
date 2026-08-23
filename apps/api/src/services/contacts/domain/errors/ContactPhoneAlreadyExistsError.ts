/**
 * Editar (ou criar manualmente) um contato para um telefone que já pertence
 * a OUTRO contato do mesmo tenant — Reorganização Contatos/Campanhas
 * (2026-08-17). A constraint `@@unique([tenantId, phoneE164])` é quem
 * garante isso; este erro só dá um nome de Domain para o `P2002` do Prisma.
 */
export class ContactPhoneAlreadyExistsError extends Error {
  constructor(public readonly phoneE164: string) {
    super(`Já existe um contato com o telefone ${phoneE164} neste tenant.`);
    this.name = 'ContactPhoneAlreadyExistsError';
  }
}
