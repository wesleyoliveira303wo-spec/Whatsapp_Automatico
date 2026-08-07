import { MessageContentType } from '../entities/Message';

/** Fase 1, Bloco F1.7 — teto de caracteres da prévia (mesmo espírito de `formatConversationTimestamp`: linha de inbox, não a mensagem inteira). */
const MAX_PREVIEW_LENGTH = 120;

/** Rótulo textual para mídia sem legenda, mesma convenção usada em `MessageBubble.tsx` (Fase 1, Bloco F1.1) para o cliente humano entender o que é sem abrir a conversa. */
const MEDIA_LABELS: Record<Exclude<MessageContentType, 'text'>, string> = {
  image: '📷 Imagem',
  audio: '🎤 Áudio',
  video: '🎥 Vídeo',
  document: '📄 Documento',
  sticker: '🌟 Figurinha',
};

/**
 * Fase 1, Bloco F1.7 — gera o texto da prévia gravado em
 * `WhatsAppConversation.lastMessagePreview` a cada `Message` criada (ver
 * `PrismaMessageRepository.create()`, único ponto de escrita). Função pura de
 * Domain, sem dependência de banco — testável isoladamente.
 *
 * Para texto: recorta e colapsa quebras de linha (a prévia é uma linha só,
 * mesmo padrão de app de mensageria). Para mídia: usa um rótulo textual fixo
 * quando não há legenda (`content` vazio) — evita uma prévia em branco, que
 * pareceria um bug; quando há legenda, ela some na frente do rótulo (ex.:
 * "📷 Confira essa promoção").
 */
export function buildMessagePreview(message: {
  content: string;
  contentType: MessageContentType;
}): string {
  const trimmedContent = message.content.trim().replace(/\s+/g, ' ');

  if (message.contentType === 'text') {
    return truncate(trimmedContent);
  }

  const label = MEDIA_LABELS[message.contentType];
  if (!trimmedContent) {
    return label;
  }
  return truncate(`${label} ${trimmedContent}`);
}

function truncate(text: string): string {
  if (text.length <= MAX_PREVIEW_LENGTH) return text;
  return `${text.slice(0, MAX_PREVIEW_LENGTH - 1).trimEnd()}…`;
}
