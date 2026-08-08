/**
 * Perfil de negócio de UMA SESSÃO de WhatsApp — a "Base de Conhecimento
 * (Nível 1)", ou "Cérebro da IA". Um texto livre por sessão (relação 1:1 com
 * `(tenantId, sessionName)` — migrado de 1:1 por tenant na Milestone 6,
 * Bloco M6H-3, 2026-07-25) onde o dono do negócio descreve quem é a empresa
 * atendida NAQUELE número, o que vende, preços, horários e regras de
 * atendimento. Esse `content` é ANEXADO ao prompt de sistema base pela
 * `PromptBuilder` — nunca o substitui, para que as regras de segurança (não
 * inventar preço, escalar quando não souber) sigam sempre ativas.
 *
 * Migração 1:1-tenant → 1:1-sessão (M6H-3): cada WhatsApp atendido pelo
 * Francis pode ter seu próprio contexto de negócio (ex.: uma franquia com um
 * número por unidade, cada uma com endereço/horário/preço diferentes) — o
 * modelo antigo (um só perfil por empresa) obrigava todas as sessões de um
 * tenant a compartilhar o mesmo texto, mesmo atendendo negócios distintos.
 *
 * Entidade deliberadamente enxuta (só o que os consumidores usam): `content`
 * para o `PromptBuilder`, `updatedAt` para a UI mostrar "última atualização".
 * `id`/`createdAt` existem no schema (`prisma/schema.prisma`) mas nenhum
 * consumidor precisa deles hoje (YAGNI, mesmo espírito do resto do projeto).
 */
/**
 * F1.8 (2026-08-01): campos de horário de atendimento adicionados ao perfil.
 * A interface é estruturalmente compatível com `WorkingHoursConfig`
 * (`services/ai/domain/workingHours.ts`) — qualquer `AiBusinessProfile` pode
 * ser passado onde `WorkingHoursConfig` é esperado, sem conversão explícita.
 */
export interface AiBusinessProfile {
  tenantId: string;
  sessionName: string;
  content: string;
  updatedAt: Date;
  /** Quando `true`, a IA avisa sobre horário de atendimento em mensagens fora do expediente. */
  offHoursEnabled: boolean;
  /** Mensagem customizada para fora do expediente; `null` = usa o texto padrão. */
  offHoursMessage: string | null;
  /** Início do expediente, formato "HH:MM". `null` = não configurado. */
  workingHoursStart: string | null;
  /** Fim do expediente, formato "HH:MM". `null` = não configurado. */
  workingHoursEnd: string | null;
  /** Bitmask de dias de atendimento (bit0=Dom…bit6=Sáb). Default 62 = Seg–Sex. */
  workingDays: number;
  /** Timezone IANA (ex.: "America/Sao_Paulo"). */
  timezone: string;
  /**
   * Fase 1 (2026-08-07) — Botão POWER: `true` = a IA processa/responde
   * NOVAS mensagens desta sessão normalmente; `false` = a IA não gera
   * resposta automática (WhatsApp continua conectado, mensagens continuam
   * chegando/aparecendo na Dashboard, atendimento humano continua normal).
   * Ver `shouldAutoRespond` (`services/conversations/domain/policies`).
   */
  aiEnabled: boolean;
}
