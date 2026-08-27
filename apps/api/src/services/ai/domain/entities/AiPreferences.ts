/** Nível de autonomia da IA — orienta o quanto ela avança sozinha antes de preferir um humano. */
export type AiAutonomyLevel = 'conservative' | 'balanced' | 'autonomous';

export const AI_AUTONOMY_LEVELS: readonly AiAutonomyLevel[] = [
  'conservative',
  'balanced',
  'autonomous',
];

/**
 * Preferências/limites operacionais REAIS da IA de UMA sessão — Cérebro da
 * IA v3, Fase 3 (2026-08-26). Relação 1:1 com `(tenantId, sessionName)`,
 * mesmo padrão de `AiBusinessProfile` (M6H-3).
 *
 * Cada campo aqui muda comportamento de verdade — nunca um toggle
 * decorativo (decisão explícita do fundador ao revisar a arquitetura desta
 * fase): `autonomyLevel`/`maxDiscountPercent`/`topicsToAvoid`/
 * `escalateAfterAttempts` viram texto no prompt via `buildPreferencesContext`
 * (`services/ai/domain/preferencesContext.ts`); `customHandoffMessage`
 * substitui a mensagem padrão de encaminhamento em `AiReplyJobProcessor`
 * quando a IA falha e precisa escalar.
 */
export interface AiPreferences {
  tenantId: string;
  sessionName: string;
  updatedAt: Date;
  autonomyLevel: AiAutonomyLevel;
  /** Desconto máximo (%) que a IA pode oferecer sozinha. `null` = sem limite configurado (nunca oferece). */
  maxDiscountPercent: number | null;
  /** Assuntos a evitar/redirecionar para um humano. `null`/vazio = nenhuma restrição extra. */
  topicsToAvoid: string | null;
  /** Depois de quantas tentativas sem sucesso a IA deve preferir escalar. `null` = critério padrão do prompt. */
  escalateAfterAttempts: number | null;
  /** Mensagem customizada de encaminhamento ao cliente. `null` = usa o texto padrão do sistema. */
  customHandoffMessage: string | null;
}
