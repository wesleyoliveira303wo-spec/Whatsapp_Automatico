/**
 * Marcador interno que a IA inclui na resposta quando REALMENTE recebeu e
 * conseguiu processar um áudio do cliente como anexo multimodal (feature de
 * transcrição de áudio, 2026-08-24) — mesmo padrão de `ESCALATION_MARKER`
 * (`escalationSignal.ts`)/`STAGE_MARKER` (`stageSignal.ts`): a instrução de
 * quando/como emiti-lo vive no `systemPrompt` (`MARKER_INSTRUCTIONS`, em
 * `PromptVersion.ts`); a detecção/remoção vive em `extractAudioTranscript`
 * (abaixo).
 *
 * CONTEXTO — por que isto existe: `ConversationAiService.loadLatestInboundMedia`
 * (Fase 1, Bloco F1.2) já anexa o binário do áudio mais recente à MESMA
 * chamada que gera a resposta — o modelo já "ouve" o áudio de verdade, sem
 * nenhuma chamada de IA extra. O que faltava era CAPTURAR essa transcrição
 * como texto reaproveitável: sem isso, a IA só "ouvia" o áudio na resposta
 * imediatamente seguinte a ele — turnos futuros da mesma conversa voltavam a
 * ver só a descrição genérica entre colchetes ("[O cliente enviou um(a)
 * áudio, sem legenda]"), sem nenhum conteúdo. Pedindo à IA para incluir a
 * transcrição literal dentro da MESMA resposta (marcador, igual aos já
 * existentes), zero chamada de IA adicional é necessária — é a mesma
 * chamada multimodal fazendo dupla função.
 *
 * Formato `[[TRANSCRICAO_AUDIO:texto]]` — mesmo racional de "improvável de
 * aparecer numa resposta natural, fácil de remover sem sobra" dos outros
 * marcadores. Diferente de `STAGE_MARKER`/`ESCALATION_MARKER` (valor de um
 * conjunto fechado), aqui o conteúdo é TEXTO LIVRE (a transcrição em si) —
 * por isso a extração captura tudo até o PRIMEIRO `]]`, não um padrão de
 * caracteres restrito. NUNCA deve chegar ao cliente — sempre retirado antes
 * do envio, mesmo ponto do pipeline em que `extractEscalation`/`extractStage`
 * já rodam (`ConversationAiService.generateReply`).
 */
export const AUDIO_TRANSCRIPT_MARKER_PREFIX = '[[TRANSCRICAO_AUDIO:';
export const AUDIO_TRANSCRIPT_MARKER_SUFFIX = ']]';

/**
 * Resultado de inspecionar uma resposta da IA em busca do marcador de
 * transcrição de áudio. `content` é o texto JÁ SEM o marcador; `transcript`
 * é o texto capturado (aparado de espaços), ou `undefined` se a IA não
 * incluiu o marcador (áudio não foi anexado nesta chamada, ou o modelo não
 * conseguiu transcrever) — nunca `undefined` por causa de um marcador vazio
 * (`[[TRANSCRICAO_AUDIO:]]` some do texto mas não vira uma transcrição,
 * mesma degradação graciosa de `extractStage` para um valor não reconhecido).
 */
export interface AudioTranscriptExtraction {
  transcript?: string;
  content: string;
}

/**
 * Detecta e remove o marcador de transcrição de áudio de uma resposta da IA.
 * Função pura de Domain (mesmo espírito de `extractStage`/`extractEscalation`).
 * Procura a PRIMEIRA ocorrência de `[[TRANSCRICAO_AUDIO:...]]`, capturando
 * tudo entre o prefixo e o primeiro `]]` (non-greedy) — uma transcrição real
 * de fala não deveria conter `]]` literal, e mesmo que contivesse, capturar
 * só até o primeiro fechamento é o comportamento mais previsível.
 */
export function extractAudioTranscript(content: string): AudioTranscriptExtraction {
  const pattern = /\[\[TRANSCRICAO_AUDIO:([\s\S]*?)\]\]/;
  const match = content.match(pattern);
  if (!match) {
    return { content };
  }

  const cleaned = content
    .replace(pattern, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const transcript = match[1].trim();
  return { transcript: transcript || undefined, content: cleaned };
}
