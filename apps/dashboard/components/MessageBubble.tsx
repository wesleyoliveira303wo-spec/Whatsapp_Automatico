import { FileText, Download, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/formatters';
import { getMessageMediaUrl } from '@/lib/clientApi';
import MessageAudioPlayer from './MessageAudioPlayer';
import type { ConversationMessage, AiInteractionSummary } from '@/lib/clientApi';

interface MessageBubbleProps {
  message: ConversationMessage;
  /** Interacao de IA que GEROU esta mensagem (correlacao por `messageId`, D27) — presente so em outbound geradas pela IA. */
  aiInteraction?: AiInteractionSummary;
  /**
   * Reskin 2026-08-27 — `true` quando a mensagem anterior veio do OUTRO
   * lado da conversa (ou não existe). Abre respiro vertical entre grupos,
   * mantendo mensagens consecutivas do mesmo lado coladas — padrão da
   * referência. Default `true` (comportamento espaçado) para quem renderiza
   * uma bolha isolada, sem contexto de lista.
   */
  spacedFromPrevious?: boolean;
}

/** Classes de cor da bolha, direção-dependentes — mesmo par usado por texto/documento/áudio (Design System, tela Conversas). */
function bubbleColorClassName(outbound: boolean): string {
  return outbound ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground';
}

/** Raio assimétrico ("cauda") — canto oposto ao lado da bolha fica quase reto (4px), os outros 12px (Design System §4). */
function bubbleTailClassName(outbound: boolean): string {
  return outbound ? 'rounded-xl rounded-br-[4px]' : 'rounded-xl rounded-bl-[4px]';
}

/**
 * Conteúdo de uma mensagem de MÍDIA (Fase 1, Bloco F1.1, ADR #90) — a URL
 * de `src`/`href` sempre aponta para o proxy BFF (`getMessageMediaUrl`),
 * NUNCA para `message.media.url` diretamente: aquela é a URL `.enc` crua do
 * WhatsApp (criptografada, inútil sem decifrar a `mediaKey` primeiro) — só
 * o BFF/API sabem decifrar. O navegador baixa nativamente via `<img>`/
 * `<video>`/`<a>`, sem nenhum fetch manual no cliente.
 *
 * Reskin 2026-08-06 — documento/áudio ganham a moldura colorida da bolha
 * (mesma regra de direção que o texto); imagem/vídeo continuam sem moldura
 * (são a própria mídia). Documento OMITE o tamanho do arquivo do mockup — a
 * API não guarda esse dado (`MessageMediaReference` não tem campo de
 * tamanho); mostrar um valor inventado violaria "nunca prometer o que o
 * produto não entrega" (mesma regra já aplicada ao check duplo de leitura).
 *
 * `outbound`/mensagem sem `media` (dado antigo/inconsistente) cai no
 * fallback de texto — nunca quebra a tela por falta de referência.
 */
function MessageMediaContent({
  message,
  outbound,
}: {
  message: ConversationMessage;
  outbound: boolean;
}): JSX.Element | null {
  if (!message.media) {
    return null;
  }
  const mediaUrl = getMessageMediaUrl(message.conversationId, message.id);

  switch (message.contentType) {
    case 'image':
    case 'sticker':
      return (
        // eslint-disable-next-line @next/next/no-img-element -- binário servido pelo proxy BFF (sessão/cookie), não um asset otimizável pelo next/image.
        <img
          src={mediaUrl}
          alt={message.content || 'Imagem recebida'}
          className="max-h-64 max-w-[66%] rounded-xl object-contain"
        />
      );
    case 'video':
      return <video src={mediaUrl} controls className="max-h-64 max-w-[66%] rounded-xl" />;
    case 'audio':
      return <MessageAudioPlayer src={mediaUrl} className={bubbleColorClassName(outbound)} />;
    case 'document':
      return (
        <div
          className={cn(
            'flex max-w-[66%] min-w-[240px] items-center gap-[11px] rounded-xl px-[13px] py-[11px]',
            bubbleColorClassName(outbound),
          )}
        >
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-current/[.16]">
            <FileText className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
            {message.media.fileName ?? 'Documento'}
          </span>
          <a
            href={mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Baixar"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-current/[.14] hover:bg-current/[.26]"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      );
    default:
      return null;
  }
}

/**
 * Uma mensagem na timeline (Milestone 3, Bloco 6). Inbound a esquerda
 * (contato), outbound a direita (bot/operador). Outbound correlacionada a
 * uma `AiInteraction` (D27) ganha o selo "Gerada por IA" com o modelo —
 * na ausencia de correlacao, nenhuma inferencia e feita (D26: nada de
 * heuristica; so o que os dados afirmam).
 *
 * Reskin 2026-08-06 — a linha de metadados (horário, selo "Gerada por IA",
 * check de enviado) sai de DENTRO da bolha e passa a viver ABAIXO dela,
 * sobre o fundo da timeline (não mais tingida pela cor da bolha) — mesma
 * estrutura do mockup. A legenda de uma mídia (Fase 1, Bloco F1.1) também
 * migra para fora/abaixo da bolha quando a mensagem é de mídia; para texto
 * puro, o texto continua sendo o próprio conteúdo da bolha.
 *
 * Redesign 2026-08-05 (R3): outbound ganha um ÚNICO `Check` ao lado do
 * horário ("enviado" — é só o que o domínio de fato sabe, `WhatsAppMessage`
 * não guarda status de entrega/leitura no WhatsApp do contato). NUNCA um
 * duplo-check azul ("lido") — isso exigiria dado que não existe hoje
 * (`providerMessageId` + assinar `messages.update` no `BaileysProvider`,
 * fora de escopo deste redesign) e prometeria algo que o produto não cumpre.
 */
export default function MessageBubble({
  message,
  aiInteraction,
  spacedFromPrevious = true,
}: MessageBubbleProps): JSX.Element {
  const outbound = message.direction === 'outbound';
  const contentType = message.contentType ?? 'text';
  const isMedia = contentType !== 'text';

  return (
    <li
      className={cn(
        'flex flex-col',
        spacedFromPrevious ? 'mt-[10px]' : 'mt-[2px]',
        outbound ? 'items-end' : 'items-start',
      )}
    >
      {isMedia ? (
        <MessageMediaContent message={message} outbound={outbound} />
      ) : (
        <div
          className={cn(
            'max-w-[66%] px-[13px] pb-[10px] pt-[9px] text-[13.5px] leading-[1.5]',
            bubbleColorClassName(outbound),
            bubbleTailClassName(outbound),
          )}
        >
          <p className="whitespace-pre-wrap break-words text-pretty">{message.content}</p>
        </div>
      )}
      {isMedia && message.content && (
        <p className="mt-1 max-w-[66%] text-[12.5px] leading-[1.45] text-muted-foreground">
          {message.content}
        </p>
      )}
      <div className="mt-[5px] flex items-center gap-1.5 px-[3px]">
        {aiInteraction && (
          <span title="Mensagem escrita pela IA" className="text-[11px] font-medium text-primary">
            Gerada por IA{aiInteraction.model ? ` · ${aiInteraction.model}` : ''}
          </span>
        )}
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {formatDateTime(message.occurredAt)}
        </span>
        {outbound && (
          <Check
            className="h-[13px] w-[13px] shrink-0 text-muted-foreground"
            aria-label="Enviado"
          />
        )}
      </div>
    </li>
  );
}
