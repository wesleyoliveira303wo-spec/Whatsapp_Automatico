/**
 * Marcador interno que a IA inclui na resposta quando decide passar o
 * atendimento para um humano (feature N2 — auto-escalonamento). A instrução de
 * quando/como emiti-lo vive no `systemPrompt` (ver `PROMPT_VERSIONS`); a
 * detecção/remoção vive em `extractEscalation` (abaixo). Manter a string numa
 * constante única evita divergência entre o que o prompt manda escrever e o que
 * o código procura.
 *
 * Formato `[[...]]`: improvável de aparecer numa resposta natural de
 * atendimento, e fácil de remover sem sobra. NUNCA deve chegar ao cliente — é
 * sempre retirado antes do envio.
 */
export const ESCALATION_MARKER = '[[ESCALAR_HUMANO]]';

/**
 * Resultado de inspecionar uma resposta da IA em busca do marcador de
 * escalonamento. `content` é o texto JÁ SEM o marcador (o que o cliente recebe);
 * `escalate` diz se a IA pediu para passar para um humano.
 */
export interface EscalationExtraction {
  escalate: boolean;
  content: string;
}

/**
 * Detecta e remove o `ESCALATION_MARKER` de uma resposta da IA. Função pura de
 * Domain (mesmo espírito de `validateReply`/`shouldAutoRespond`): não decide o
 * que fazer com a escalada — só reporta e limpa. Remove TODAS as ocorrências
 * (a IA às vezes repete o marcador) e apara espaços/linhas em branco que sobram.
 */
export function extractEscalation(content: string): EscalationExtraction {
  if (!content.includes(ESCALATION_MARKER)) {
    return { escalate: false, content };
  }
  const cleaned = content.split(ESCALATION_MARKER).join('').replace(/\n{3,}/g, '\n\n').trim();
  return { escalate: true, content: cleaned };
}
