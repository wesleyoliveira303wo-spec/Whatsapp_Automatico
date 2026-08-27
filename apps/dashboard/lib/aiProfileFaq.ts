/**
 * Cérebro da IA — utilitário de composição do texto livre ("Conhecimento").
 *
 * `appendToProfileContent` é a função genérica por trás do modo "Assistente
 * Guiado" (`AiProfilePanel`): sempre ANEXA ao final do conteúdo já
 * existente, nunca sobrescreve (correção 2026-07-30, ADR #87 — antes disso,
 * gerar texto pelo quiz apagava qualquer coisa já escrita manualmente).
 *
 * A antiga `appendFaqEntry` ("Cadastrar pergunta não respondida", ADR #71
 * item (a)) foi REMOVIDA na Cérebro da IA v3, Fase 2 (2026-08-25) — a FAQ
 * deixou de ser texto cru anexado ao blob e virou uma entidade estruturada
 * própria (`AiFaqPanel`/`useAiFaqEntries`, aba "FAQ" dedicada).
 *
 * Função pura, mesmo racional de `aiProfileQuiz.ts`/`conversationsView.ts`:
 * testável sem jsdom, sem falar com a API.
 */

/**
 * Anexa um bloco de texto ao FINAL do conteúdo já existente do Cérebro da
 * IA, separado por uma linha em branco — NUNCA sobrescreve o que já está
 * lá. Função genérica por trás tanto da FAQ manual (`appendFaqEntry`)
 * quanto do texto gerado pelo quiz (`AiProfilePanel`, modo "Assistente
 * Guiado") — os dois modos ADICIONAM instruções ao prompt final da IA, eles
 * nunca competem pelo mesmo texto (correção 2026-07-30: antes desta função
 * existir, o quiz fazia `setContent(text)` e apagava qualquer FAQ/texto já
 * escrito manualmente — bug real reportado pelo fundador).
 */
export function appendToProfileContent(currentContent: string, addition: string): string {
  const trimmedAddition = addition.trim();
  const base = currentContent.trim();
  if (!trimmedAddition) return base;
  return base ? `${base}\n\n${trimmedAddition}` : trimmedAddition;
}
