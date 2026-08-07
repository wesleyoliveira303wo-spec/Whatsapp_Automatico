/**
 * Cérebro da IA — "Cadastrar pergunta não respondida" (ADR #71 item (a):
 * "aprendizado contínuo sem RAG... registrar as perguntas que fizeram a IA
 * escalar por 'não sei' → tela de lacunas de conhecimento com atalho para
 * ensinar"). Esta é a versão MANUAL desse atalho: o dono do negócio digita a
 * pergunta que um cliente fez (por exemplo, ao ver que a IA escalou) e a
 * resposta correta; o par vira uma linha a mais no texto do Cérebro da IA.
 *
 * Deliberadamente SEM captura automática a partir de uma conversa real — o
 * backend hoje não guarda o texto da pergunta do cliente vinculado a um
 * escalonamento (`AiInteraction` não linka a `Message` inbound, e o
 * marcador de escalonamento não distingue "não sei" de "cliente pediu
 * humano"). Automatizar isso é trabalho de backend novo, fora deste bloco —
 * ver ADR #71 itens (b)/(c) para as extensões futuras (assuntos recorrentes,
 * sugestão automática de FAQ).
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

/** Pergunta e resposta separadas por uma linha em branco de aviso (rótulos em negrito markdown — mesmo estilo de lista usado pelo texto livre/placeholder). */
export function appendFaqEntry(currentContent: string, question: string, answer: string): string {
  const trimmedQuestion = question.trim();
  const trimmedAnswer = answer.trim();
  return appendToProfileContent(
    currentContent,
    `**P:** ${trimmedQuestion}\n**R:** ${trimmedAnswer}`,
  );
}
