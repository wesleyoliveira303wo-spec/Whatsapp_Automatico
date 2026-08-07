/**
 * Motivo pelo qual a IA decidiu passar o atendimento para um humano —
 * Fase 1, Bloco F1.4 (2026-08-01, ADR pequena registrada em DECISIONS.md).
 * Distinção pedida pelo fundador: pré-requisito para a captura automática de
 * lacunas de conhecimento (ADR #71 itens b/c) — sem saber SE a IA escalou
 * por não saber responder (lacuna real de conteúdo) ou porque o cliente só
 * queria falar com uma pessoa (nada a aprender), não dá para listar "as
 * perguntas que a IA não soube responder" de forma confiável.
 *
 * - `'unknown_answer'`: a IA não sabia responder com segurança (não tinha a
 *   informação no histórico/Base de Conhecimento). É o sinal de LACUNA.
 * - `'requested_human'`: o cliente pediu explicitamente para falar com uma
 *   pessoa — não é uma lacuna de conteúdo, é uma preferência do cliente.
 */
export type EscalationReason = 'unknown_answer' | 'requested_human';

/**
 * Marcadores internos que a IA inclui na resposta quando decide passar o
 * atendimento para um humano (feature N2 — auto-escalonamento). A instrução de
 * quando/como emiti-los vive no `systemPrompt` (ver `PROMPT_VERSIONS`); a
 * detecção/remoção vive em `extractEscalation` (abaixo). Manter as strings em
 * constantes únicas evita divergência entre o que o prompt manda escrever e o
 * que o código procura.
 *
 * Formato `[[...]]`: improvável de aparecer numa resposta natural de
 * atendimento, e fácil de remover sem sobra. NUNCA devem chegar ao cliente —
 * são sempre retirados antes do envio.
 *
 * Fase 1, Bloco F1.4: o marcador único `[[ESCALAR_HUMANO]]` virou dois,
 * espelhando `EscalationReason` — quebra de contrato deliberada (nenhum
 * cliente externo depende do formato do marcador; é interno ao prompt/parser
 * deste mesmo bounded context).
 */
export const ESCALATION_MARKER_UNKNOWN_ANSWER = '[[ESCALAR_HUMANO:NAO_SEI]]';
export const ESCALATION_MARKER_REQUESTED_HUMAN = '[[ESCALAR_HUMANO:PEDIU_ATENDENTE]]';

const MARKERS_BY_REASON: Record<EscalationReason, string> = {
  unknown_answer: ESCALATION_MARKER_UNKNOWN_ANSWER,
  requested_human: ESCALATION_MARKER_REQUESTED_HUMAN,
};

/**
 * Resultado de inspecionar uma resposta da IA em busca de um marcador de
 * escalonamento. `content` é o texto JÁ SEM o marcador (o que o cliente
 * recebe); `escalationReason` é `undefined` quando a IA não escalou, ou o
 * motivo (`EscalationReason`) quando escalou.
 */
export interface EscalationExtraction {
  escalationReason?: EscalationReason;
  content: string;
}

/**
 * Detecta e remove um marcador de escalonamento de uma resposta da IA. Função
 * pura de Domain (mesmo espírito de `validateReply`/`shouldAutoRespond`): não
 * decide o que fazer com a escalada — só reporta e limpa. Remove TODAS as
 * ocorrências do marcador encontrado (a IA às vezes repete) e apara espaços/
 * linhas em branco que sobram.
 *
 * Se, por algum motivo, a resposta contiver os DOIS marcadores (não
 * instruído no prompt, mas não impossível de um modelo gerar), prevalece
 * `unknown_answer` — é o sinal mais informativo para a captura futura de
 * lacunas (item da ADR #71); ambos os marcadores são removidos do texto de
 * qualquer forma.
 */
export function extractEscalation(content: string): EscalationExtraction {
  const hasUnknownAnswer = content.includes(ESCALATION_MARKER_UNKNOWN_ANSWER);
  const hasRequestedHuman = content.includes(ESCALATION_MARKER_REQUESTED_HUMAN);

  if (!hasUnknownAnswer && !hasRequestedHuman) {
    return { escalationReason: undefined, content };
  }

  const escalationReason: EscalationReason = hasUnknownAnswer
    ? 'unknown_answer'
    : 'requested_human';
  const cleaned = content
    .split(ESCALATION_MARKER_UNKNOWN_ANSWER)
    .join('')
    .split(ESCALATION_MARKER_REQUESTED_HUMAN)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { escalationReason, content: cleaned };
}

/** Devolve o marcador de texto correspondente a um `EscalationReason` — usado só por `PromptVersion.ts` (instrução ao modelo). */
export function escalationMarkerFor(reason: EscalationReason): string {
  return MARKERS_BY_REASON[reason];
}
