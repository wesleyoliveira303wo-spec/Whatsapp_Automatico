/**
 * Divide o texto final de uma resposta da IA (já sem os marcadores internos
 * de estágio/escalonamento — `stageSignal.ts`/`escalationSignal.ts` já os
 * extraem antes deste ponto) em uma ou mais "mensagens" — Fase 1 (pedido do
 * fundador, 2026-08-07): a IA hoje escreve respostas de vários parágrafos
 * (cada um numa linha própria) e o sistema enviava tudo como UM único balão
 * de texto grande no WhatsApp. O pedido foi enviar um parágrafo por vez,
 * como uma pessoa digitando várias mensagens seguidas — não um bloco só.
 *
 * Quebra em QUALQUER sequência de uma ou mais quebras de linha (`\n+`), não
 * só linha em branco dupla — a IA já separa ideias com uma quebra de linha
 * simples (ver os exemplos em `PromptVersion.ts`), então exigir linha em
 * branco dupla deixaria a função praticamente inerte. Trecho vazio (ex.:
 * duas quebras de linha seguidas, ou espaço solto entre elas) é descartado.
 * Se por algum motivo a divisão não sobrar nenhum trecho não-vazio (ex.:
 * conteúdo era só espaço em branco — não deveria acontecer, a validação de
 * `ConversationAiService` já rejeita resposta vazia antes daqui), devolve o
 * texto original inteiro como única mensagem — nunca uma lista vazia (o
 * chamador sempre precisa enviar ALGO).
 */
export function splitReplyIntoParagraphs(content: string): string[] {
  const normalized = content.replace(/\r\n?/g, '\n');
  const paragraphs = normalized
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  return paragraphs.length > 0 ? paragraphs : [normalized.trim()];
}
