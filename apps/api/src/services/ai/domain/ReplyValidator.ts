/**
 * Resultado de validar um texto gerado por IA antes de considerá-lo apto a
 * ser enviado a um usuário real — Milestone 3, Bloco 3a. Um resultado de
 * negócio, não uma exceção: rejeitar uma resposta (vazia, longa demais) é um
 * caminho ESPERADO, não uma condição excepcional (ver
 * `MILESTONE_003_AI_AUTORESPONDER.md` §2.3).
 */
export type ReplyValidationResult = { valid: true; sanitized: string } | { valid: false; reason: string };

/**
 * Decide se um texto gerado por IA é aceitável para envio — Milestone 3,
 * Bloco 3a. Função pura de Domain (mesmo padrão de `shouldAutoRespond`, em
 * `services/conversations/domain/policies/`, e de `isDisconnectReasonRecoverable`,
 * em `services/whatsapp/domain/policies/`): não sabe de onde `content`
 * veio (Claude, OpenAI, ou qualquer provider futuro), não gera texto, não
 * persiste nada — só decide.
 *
 * `maxLength` é parâmetro, não uma constante fixa aqui dentro: quem chama
 * (`ConversationAiService`) decide o limite configurado — critério de
 * aceite do documento ("rejeita... acima de um limite de tamanho
 * configurável").
 *
 * `sanitized` (no caminho válido) é o `content` após `trim()` — a única
 * "sanitização" exigida nesta Milestone; nenhum filtro de conteúdo/moderação
 * está no escopo do MVP (ver §5, risco "Qualidade/alucinação da resposta").
 */
export function validateReply(content: string, maxLength: number): ReplyValidationResult {
  const sanitized = content.trim();

  if (sanitized.length === 0) {
    return { valid: false, reason: 'Resposta vazia' };
  }

  if (sanitized.length > maxLength) {
    return { valid: false, reason: `Resposta excede o limite de ${maxLength} caracteres (${sanitized.length})` };
  }

  return { valid: true, sanitized };
}
