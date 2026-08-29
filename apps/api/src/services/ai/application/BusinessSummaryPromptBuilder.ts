import { AiGenerationRequest } from '../domain/providers/AiProvider';

/**
 * System prompt do resumo de NEGÓCIO (Auditoria do Perfil, 2026-08-28) —
 * prompt PRÓPRIO, mesmo racional de `SummaryPromptBuilder.ts` (resumo de
 * CONVERSA): nem o `PromptBuilder` do autoresponder (regras de atendimento
 * ao cliente) nem o `SummaryPromptBuilder` (resume um diálogo) servem aqui
 * — a entrada é o texto livre que o dono do negócio escreveu no Cérebro da
 * IA (`AiBusinessProfile.content`), e a saída é para OUTRA PESSOA da
 * equipe ler no Perfil ("do que se trata este WhatsApp"), nunca para o
 * cliente.
 */
const BUSINESS_SUMMARY_SYSTEM_PROMPT = `Você resume, para uso INTERNO de uma equipe, o texto que o dono de um negócio escreveu descrevendo sua empresa (o que vende, para quem, como atende) — este texto alimenta um assistente de WhatsApp.

Gere um resumo curto (2 a 3 frases, texto corrido, sem tópicos, sem saudação) descrevendo do que se trata o negócio: o que ele oferece e a quem atende.

Regras:
- Nunca invente informação que não esteja no texto.
- Nunca se dirija a um cliente — o resumo é uma nota interna, em terceira pessoa ("A empresa...", "O negócio...").
- Se o texto for vazio, curto demais ou não descrever um negócio de verdade, diga isso em vez de inventar um resumo.`;

/**
 * Transforma o `content` bruto do Cérebro da IA num `AiGenerationRequest`
 * pronto para qualquer `AiProvider` — uma única mensagem `user` (o texto
 * inteiro), sem histórico (diferente de `buildSummaryPrompt`, que resume
 * uma conversa de várias mensagens).
 */
export function buildBusinessSummaryPrompt(content: string): AiGenerationRequest {
  return {
    systemPrompt: BUSINESS_SUMMARY_SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  };
}
