/**
 * Detecção leve de categoria de mídia por "magic bytes" (assinatura binária
 * nos primeiros bytes do arquivo) — Fase 1, Bloco F1.10 (estabilidade para
 * beta). Contexto: `x-media-content-type` (`image`/`audio`/`video`/
 * `document`) é um header declarado pelo CLIENTE (a Dashboard, a partir da
 * extensão/MIME do arquivo escolhido pelo operador) — nunca conferido contra
 * o binário real antes deste bloco. O risco é BAIXO (o ator já é um operador
 * autenticado com `message:send`, não um upload anônimo), mas rotular
 * incorretamente algo que vai para o contato do WhatsApp merece pelo menos
 * uma checagem de sanidade.
 *
 * DELIBERADAMENTE NÃO EXAUSTIVO (sem biblioteca nova, mesma disciplina já
 * usada neste projeto para `GeminiAiProvider`/board Kanban — preferir
 * detecção nativa simples a uma dependência pesada tipo `file-type`): só
 * reconhece assinaturas fortes e inequívocas dos formatos mais comuns de
 * `image`/`audio`/`video`. Documentos (PDF, DOCX, TXT, planilhas) têm
 * assinaturas fracas ou inexistentes — em vez de tentar reconhecer
 * `document` positivamente (alto risco de falso positivo bloqueando upload
 * legítimo), a estratégia é: se o binário claramente parece OUTRA categoria
 * (ex.: começa com a assinatura de um PNG) e o operador declarou
 * `document`/outra coisa, ISSO é o mismatch que vale bloquear. Se a
 * assinatura for desconhecida/ambígua, a checagem deixa passar — nunca
 * quebra um upload legítimo por falta de reconhecimento.
 */
export type SniffableMediaCategory = 'image' | 'audio' | 'video';

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function asciiAt(buffer: Buffer, text: string, offset = 0): boolean {
  if (buffer.length < offset + text.length) return false;
  return buffer.toString('ascii', offset, offset + text.length) === text;
}

/**
 * Devolve a categoria que o BINÁRIO aparenta ser, só quando a assinatura é
 * forte/inequívoca — `null` quando desconhecida (documentos, formatos raros,
 * ou buffer curto demais para checar).
 */
export function sniffMediaCategory(buffer: Buffer): SniffableMediaCategory | null {
  // --- Imagem ---
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image'; // JPEG
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image'; // PNG
  if (asciiAt(buffer, 'GIF87a') || asciiAt(buffer, 'GIF89a')) return 'image'; // GIF
  if (startsWith(buffer, [0x42, 0x4d])) return 'image'; // BMP
  if (asciiAt(buffer, 'RIFF') && asciiAt(buffer, 'WEBP', 8)) return 'image'; // WEBP

  // --- Áudio ---
  if (asciiAt(buffer, 'OggS')) return 'audio'; // OGG/OPUS (mensagem de voz do WhatsApp)
  if (
    asciiAt(buffer, 'ID3') ||
    startsWith(buffer, [0xff, 0xfb]) ||
    startsWith(buffer, [0xff, 0xf3])
  )
    return 'audio'; // MP3
  if (asciiAt(buffer, 'RIFF') && asciiAt(buffer, 'WAVE', 8)) return 'audio'; // WAV
  if (asciiAt(buffer, '#!AMR')) return 'audio'; // AMR

  // --- Vídeo ---
  // Contêiner ISO BMFF (MP4/MOV/3GP): bytes 4-8 são literalmente "ftyp".
  if (asciiAt(buffer, 'ftyp', 4)) return 'video';
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return 'video'; // WEBM/MKV (EBML)

  return null;
}

/**
 * `true` quando o binário TEM uma assinatura forte de uma categoria
 * diferente da declarada — o único caso em que vale rejeitar. Categoria
 * desconhecida (retorno `null` de `sniffMediaCategory`) nunca conta como
 * mismatch, mesmo para `document` (que não tem assinatura confiável).
 */
export function isDeclaredMediaCategoryImplausible(
  declaredCategory: 'image' | 'audio' | 'video' | 'document',
  buffer: Buffer,
): boolean {
  const sniffed = sniffMediaCategory(buffer);
  return sniffed !== null && sniffed !== declaredCategory;
}
