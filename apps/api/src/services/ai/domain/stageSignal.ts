/**
 * Marcador interno que a IA inclui na resposta para sinalizar em que
 * ESTÁGIO DO FUNIL DE VENDAS ela classifica a conversa — pipeline de CRM
 * (Milestone 6, Bloco M6H-5, 2026-07-30). Mesmo padrão de
 * `ESCALATION_MARKER` (`escalationSignal.ts`, feature N2): a instrução de
 * quando/como emiti-lo vive no `systemPrompt` (`PROMPT_VERSIONS`); a
 * detecção/remoção vive em `extractStage` (abaixo).
 *
 * Formato `[[ESTAGIO:VALOR]]` — mesmo racional de "improvável de aparecer
 * numa resposta natural, fácil de remover sem sobra". NUNCA deve chegar ao
 * cliente — sempre retirado antes do envio, mesmo ponto do pipeline em que
 * `extractEscalation` já roda (`ConversationAiService.generateReply`).
 */
export const STAGE_MARKER_PREFIX = '[[ESTAGIO:';
export const STAGE_MARKER_SUFFIX = ']]';

/**
 * Os 5 valores de estágio que a IA pode escrever dentro do marcador — mesmo
 * vocabulário do enum `ConversationStage` (Prisma) e do union type
 * `Conversation['stage']` (Domain), mas em MAIÚSCULO/inglês simples: é o que
 * pedimos à IA para escrever literalmente no texto, formato mais robusto a
 * variação do modelo do que exigir JSON.
 */
const MARKER_VALUE_TO_STAGE: Record<string, StageSignalValue> = {
  NEW: 'new',
  CONTACTED: 'contacted',
  NEGOTIATING: 'negotiating',
  CLOSED_WON: 'closed_won',
  CLOSED_LOST: 'closed_lost',
};

export type StageSignalValue = 'new' | 'contacted' | 'negotiating' | 'closed_won' | 'closed_lost';

/**
 * Resultado de inspecionar uma resposta da IA em busca do marcador de
 * estágio. `content` é o texto JÁ SEM o marcador; `stage` é o valor
 * reconhecido, ou `undefined` se a IA não incluiu o marcador OU incluiu um
 * valor que não bate com nenhum dos 5 estágios conhecidos (degradação
 * graciosa — um valor inválido nunca deve derrubar a geração da resposta,
 * só é tratado como "sem sinal", mesmo espírito de `AiReplyJobProcessor`
 * nunca deixar uma dependência auxiliar quebrar o fluxo principal).
 */
export interface StageExtraction {
  stage?: StageSignalValue;
  content: string;
}

/**
 * Detecta e remove o marcador de estágio de uma resposta da IA. Função pura
 * de Domain (mesmo espírito de `extractEscalation`). Procura por
 * `[[ESTAGIO:VALOR]]` em qualquer lugar do texto (regex simples, sem
 * capturar mais de uma ocorrência — diferente de `extractEscalation`, que
 * remove TODAS as ocorrências repetidas; aqui só o PRIMEIRO marcador válido
 * importa, pois há um valor a escolher, não um booleano a "ligar").
 */
export function extractStage(content: string): StageExtraction {
  const pattern = /\[\[ESTAGIO:([A-Z_]+)\]\]/;
  const match = content.match(pattern);
  if (!match) {
    return { content };
  }

  const cleaned = content
    .replace(pattern, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const stage = MARKER_VALUE_TO_STAGE[match[1]];
  return { stage, content: cleaned };
}
