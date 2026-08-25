/**
 * Marcador interno que a IA inclui na resposta quando REALMENTE recebeu e
 * conseguiu processar uma imagem do cliente como anexo multimodal (feature
 * de descrição de imagem, 2026-08-24) — mesmo padrão de
 * `AUDIO_TRANSCRIPT_MARKER` (`audioTranscriptSignal.ts`)/`ESCALATION_MARKER`/
 * `STAGE_MARKER`: a instrução de quando/como emiti-lo vive no `systemPrompt`
 * (`MARKER_INSTRUCTIONS`, em `PromptVersion.ts`); a detecção/remoção vive em
 * `extractImageDescription` (abaixo).
 *
 * CONTEXTO — mesmo racional de `audioTranscriptSignal.ts`, aplicado a
 * imagem: `ConversationAiService.loadLatestInboundMedia` já anexa o
 * binário da imagem mais recente à MESMA chamada que gera a resposta — o
 * modelo já "vê" a imagem de verdade, sem nenhuma chamada de IA extra. O que
 * faltava era CAPTURAR essa percepção como texto reaproveitável: sem isso, a
 * IA só "via" a imagem na resposta imediatamente seguinte a ela — turnos
 * futuros da mesma conversa voltavam a ver só a descrição genérica entre
 * colchetes ("[O cliente enviou um(a) imagem, sem legenda]"), sem nenhum
 * conteúdo. Pedindo à IA para incluir a descrição dentro da MESMA resposta
 * (marcador, igual aos já existentes), zero chamada de IA adicional é
 * necessária.
 *
 * Formato `[[DESCRICAO_IMAGEM:texto]]` — mesmo racional de "improvável de
 * aparecer numa resposta natural, fácil de remover sem sobra" dos outros
 * marcadores. Conteúdo é TEXTO LIVRE (a descrição em si), mesma extração de
 * `extractAudioTranscript`. NUNCA deve chegar ao cliente — sempre retirado
 * antes do envio.
 */
export const IMAGE_DESCRIPTION_MARKER_PREFIX = '[[DESCRICAO_IMAGEM:';
export const IMAGE_DESCRIPTION_MARKER_SUFFIX = ']]';

/**
 * Resultado de inspecionar uma resposta da IA em busca do marcador de
 * descrição de imagem. `content` é o texto JÁ SEM o marcador; `description`
 * é o texto capturado (aparado de espaços), ou `undefined` se a IA não
 * incluiu o marcador — mesma degradação graciosa de `extractAudioTranscript`
 * para um marcador ausente ou vazio.
 */
export interface ImageDescriptionExtraction {
  description?: string;
  content: string;
}

/**
 * Detecta e remove o marcador de descrição de imagem de uma resposta da IA.
 * Função pura de Domain, espelhando `extractAudioTranscript` byte a byte na
 * estrutura — a única diferença é o marcador procurado.
 */
export function extractImageDescription(content: string): ImageDescriptionExtraction {
  const pattern = /\[\[DESCRICAO_IMAGEM:([\s\S]*?)\]\]/;
  const match = content.match(pattern);
  if (!match) {
    return { content };
  }

  const cleaned = content
    .replace(pattern, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const description = match[1].trim();
  return { description: description || undefined, content: cleaned };
}
