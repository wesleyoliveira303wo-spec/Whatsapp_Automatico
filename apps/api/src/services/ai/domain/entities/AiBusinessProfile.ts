/**
 * Perfil de negócio de um tenant — a "Base de Conhecimento (Nível 1)", ou
 * "Cérebro da IA". UM texto livre por empresa (relação 1:1 com Tenant) onde o
 * dono do negócio descreve quem é a empresa, o que vende, preços, horários e
 * regras de atendimento. Esse `content` é ANEXADO ao prompt de sistema base
 * pela `PromptBuilder` — nunca o substitui, para que as regras de segurança
 * (não inventar preço, escalar quando não souber) sigam sempre ativas.
 *
 * Entidade deliberadamente enxuta (só o que os consumidores usam): `content`
 * para o `PromptBuilder`, `updatedAt` para a UI mostrar "última atualização".
 * `id`/`createdAt` existem no schema (`prisma/schema.prisma`) mas nenhum
 * consumidor precisa deles hoje (YAGNI, mesmo espírito do resto do projeto).
 */
export interface AiBusinessProfile {
  tenantId: string;
  content: string;
  updatedAt: Date;
}
