/**
 * Detecção de opt-out por palavra-chave — Fase L, Bloco L2.
 *
 * Padrão consolidado de mensageria em massa ("responda PARAR para sair"),
 * exigido pela própria Política de Mensagens do WhatsApp Business
 * (`FASE_L_MOTOR_DE_LEADS.md` §7.2: qualquer pedido de descadastro precisa
 * ser atendido de imediato).
 *
 * CASA A MENSAGEM INTEIRA, NUNCA UM TRECHO. Este é o ponto de maior risco de
 * falso positivo já registrado na análise da Fase L: se a checagem fosse por
 * substring, "desculpe, hoje não posso, te chamo amanhã sem falta" conteria
 * "para" e dispararia um opt-out que ninguém pediu. Comparando a mensagem
 * INTEIRA (normalizada) contra uma lista fechada, só quem escreve
 * literalmente "parar" (ou uma das variantes abaixo) — e nada mais — aciona
 * o opt-out. O custo aceito: alguém que escreve "pode parar de mandar isso"
 * (frase, não comando isolado) não é pego automaticamente; para esses casos
 * existe o opt-out MANUAL (`ContactConsentService.recordOptOut`), acionado
 * por um humano lendo a conversa.
 *
 * Normalização: minúsculo, sem acento, espaços internos colapsados, pontuação
 * final removida — "Parar!", "PARAR.", "  parar  " todos casam.
 */

const OPT_OUT_KEYWORDS = new Set([
  'parar',
  'pare',
  'sair',
  'stop',
  'cancelar',
  'cancela',
  'descadastrar',
  'descadastre',
  'nao quero mais receber',
  'nao quero receber',
  'remover',
]);

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove marcas de acento (mesma técnica de `contactImport.ts`)
    .replace(/[.!?]+$/, '') // pontuação final solta ("parar!", "parar.")
    .replace(/\s+/g, ' ');
}

/**
 * `true` quando `text` — a mensagem INTEIRA, não um trecho — é um comando de
 * opt-out reconhecido. `false` para qualquer outra coisa, inclusive uma frase
 * que só MENCIONE uma dessas palavras.
 */
export function isOptOutKeyword(text: string): boolean {
  return OPT_OUT_KEYWORDS.has(normalize(text));
}
