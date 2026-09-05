import { FileText, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMessageMediaUrl } from '@/lib/clientApi';
import MessageAudioPlayer from './MessageAudioPlayer';
import MessageMeta from './MessageMeta';
import type { MessageDeliveryStatus } from './MessageStatus';
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
  /**
   * `true` quando a IA sinalizou que NÃO SOUBE responder esta mensagem
   * (pedido do fundador, 2026-09-05). Vem de uma consulta às lacunas da
   * conversa — nunca inferido do texto.
   */
  unanswered?: boolean;
  /** Abre o cadastro da resposta. Só faz sentido junto com `unanswered`. */
  onTeachAnswer?: () => void;
}

/**
 * Único status de entrega que o produto sabe afirmar hoje. `WhatsAppMessage`
 * não guarda confirmação de entrega/leitura do WhatsApp do contato — exibir
 * "entregue"/"lido" seria prometer o que o produto não cumpre. Quando esse
 * dado existir (`providerMessageId` + `messages.update` no `BaileysProvider`),
 * esta constante vira o campo real da mensagem e nada mais muda.
 */
const OUTBOUND_DELIVERY_STATUS: MessageDeliveryStatus = 'sent';

/** Cor da bolha, direção-dependente — tokens EXCLUSIVOS da tela de conversa (ver globals.css). */
function bubbleColorClassName(outbound: boolean): string {
  return outbound
    ? 'bg-chat-bubble-out text-chat-bubble-out-foreground'
    : 'bg-chat-bubble-in text-chat-bubble-in-foreground';
}

/**
 * Raio da bolha na referência: 12px em três cantos e ~4px no canto que
 * aponta para o interlocutor ("cauda"), do lado correspondente à direção.
 */
function bubbleTailClassName(outbound: boolean): string {
  return outbound ? 'rounded-xl rounded-br-[4px]' : 'rounded-xl rounded-bl-[4px]';
}

/** Largura máxima responsiva — bolha cresce com o conteúdo, mas nunca toma a tela toda. */
const BUBBLE_MAX_WIDTH = 'max-w-[85%] sm:max-w-[75%] lg:max-w-[min(75%,30rem)]';

/**
 * Extensão do arquivo, para a linha de metadados do documento. Deriva do
 * NOME (fonte mais confiável) e cai no subtipo do MIME quando o nome não
 * tem extensão. NUNCA exibimos tamanho nem contagem de páginas: a API não
 * guarda esses dados (`MessageMediaReference` não tem campo de tamanho), e
 * inventar um valor violaria a regra de nunca prometer o que o produto não
 * entrega.
 */
function documentExtensionLabel(fileName: string | undefined, mimeType: string): string {
  const fromName = fileName && fileName.includes('.') ? fileName.split('.').pop() : undefined;
  if (fromName) return fromName.toUpperCase();
  const fromMime = mimeType.split('/')[1];
  return fromMime ? fromMime.toUpperCase() : 'ARQUIVO';
}

/**
 * Conteúdo de uma mensagem de MÍDIA (Fase 1, Bloco F1.1, ADR #90) — a URL
 * de `src`/`href` sempre aponta para o proxy BFF (`getMessageMediaUrl`),
 * NUNCA para `message.media.url` diretamente: aquela é a URL `.enc` crua do
 * WhatsApp (criptografada, inútil sem decifrar a `mediaKey` primeiro) — só
 * o BFF/API sabem decifrar. O navegador baixa nativamente via `<img>`/
 * `<video>`/`<a>`, sem nenhum fetch manual no cliente.
 *
 * Reskin 2026-08-27 — cada tipo de mídia carrega o PRÓPRIO `MessageMeta`
 * (horário + status), como na referência: sobre a foto/vídeo vira um chip
 * escuro translúcido; em áudio/documento fica na moldura, junto do
 * conteúdo. Isso é o que impede o horário de virar um elemento solto
 * abaixo da mensagem.
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
  const status = outbound ? OUTBOUND_DELIVERY_STATUS : undefined;

  switch (message.contentType) {
    case 'image':
    case 'sticker':
      return (
        <div className={cn('relative', BUBBLE_MAX_WIDTH)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- binário servido pelo proxy BFF (sessão/cookie), não um asset otimizável pelo next/image. */}
          <img
            src={mediaUrl}
            alt={message.content || 'Imagem recebida'}
            className="chat-bubble-shadow max-h-64 max-w-full rounded-xl object-contain"
          />
          <MessageMeta
            occurredAt={message.occurredAt}
            status={status}
            overlay
            className="absolute bottom-2 right-2"
          />
        </div>
      );
    case 'video':
      return (
        <div className={cn('relative', BUBBLE_MAX_WIDTH)}>
          <video src={mediaUrl} controls className="chat-bubble-shadow max-h-64 max-w-full rounded-xl" />
          <MessageMeta
            occurredAt={message.occurredAt}
            status={status}
            overlay
            className="absolute bottom-2 right-2"
          />
        </div>
      );
    case 'audio':
      return (
        <MessageAudioPlayer
          src={mediaUrl}
          outbound={outbound}
          occurredAt={message.occurredAt}
          status={status}
          className={cn(
            'chat-bubble-shadow',
            BUBBLE_MAX_WIDTH,
            bubbleColorClassName(outbound),
            bubbleTailClassName(outbound),
          )}
        />
      );
    case 'document':
      return (
        <div
          className={cn(
            'chat-bubble-shadow flex min-w-[240px] flex-col gap-[7px] px-[9px] pb-[6px] pt-[7px]',
            BUBBLE_MAX_WIDTH,
            bubbleColorClassName(outbound),
            bubbleTailClassName(outbound),
          )}
        >
          <div className="flex items-center gap-[11px]">
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
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase text-chat-meta">
              {documentExtensionLabel(message.media.fileName, message.media.mimeType)}
            </span>
            <MessageMeta occurredAt={message.occurredAt} status={status} />
          </div>
        </div>
      );
    default:
      return null;
  }
}

/**
 * Uma mensagem na timeline (Milestone 3, Bloco 6). Inbound a esquerda
 * (contato), outbound a direita (bot/operador) — a direção é a ÚNICA fonte
 * de alinhamento e cor; nada de lógica duplicada entre os dois casos.
 * Outbound correlacionada a uma `AiInteraction` (D27) ganha o selo "Gerada
 * por IA" com o modelo — na ausencia de correlacao, nenhuma inferencia e
 * feita (D26: nada de heuristica; so o que os dados afirmam).
 *
 * Reskin 2026-08-27 (reverte a decisão de 2026-08-06 de tirar o horário da
 * bolha): na referência, horário e status vivem DENTRO da bolha, no canto
 * inferior direito, e a última linha do texto reserva espaço para eles.
 * Isso é feito com um espaçador inline invisível no fim do parágrafo + o
 * `MessageMeta` posicionado em `absolute` — técnica da própria referência.
 * Uma bolha curta cresce o suficiente para o horário caber ao lado do texto;
 * uma bolha longa empurra o horário para o canto da última linha.
 *
 * O selo "Gerada por IA" sobe para FORA e ACIMA da bolha: é informação
 * nossa, não do WhatsApp, e dentro da bolha competiria com o horário.
 */
export default function MessageBubble({
  message,
  aiInteraction,
  spacedFromPrevious = true,
  unanswered = false,
  onTeachAnswer,
}: MessageBubbleProps): JSX.Element {
  const outbound = message.direction === 'outbound';
  const contentType = message.contentType ?? 'text';
  const isMedia = contentType !== 'text';
  const status = outbound ? OUTBOUND_DELIVERY_STATUS : undefined;

  return (
    <li
      className={cn(
        'flex flex-col',
        spacedFromPrevious ? 'mt-[10px]' : 'mt-[2px]',
        outbound ? 'items-end' : 'items-start',
      )}
    >
      {aiInteraction && (
        <span
          title="Mensagem escrita pela IA"
          className="mb-[3px] px-1 text-[11px] font-medium text-primary"
        >
          Gerada por IA{aiInteraction.model ? ` · ${aiInteraction.model}` : ''}
        </span>
      )}

      {/*
        A bolha e o marcador de lacuna ficam lado a lado: o marcador é um
        botão pequeno, cinza, FORA da bolha — dentro dela competiria com o
        texto do cliente e com o horário.
      */}
      <div className={cn('flex items-center gap-1.5', outbound && 'flex-row-reverse')}>
        {unanswered && (
          <button
            type="button"
            onClick={onTeachAnswer}
            aria-label="A IA não soube responder esta mensagem — cadastrar resposta"
            title="A IA não soube responder esta mensagem. Clique para cadastrar a resposta."
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
          >
            !
          </button>
        )}
      {isMedia ? (
        <MessageMediaContent message={message} outbound={outbound} />
      ) : (
        <div
          className={cn(
            'chat-bubble-shadow relative px-[9px] pb-[6px] pt-[6px] text-[14.2px] leading-[19px]',
            BUBBLE_MAX_WIDTH,
            bubbleColorClassName(outbound),
            bubbleTailClassName(outbound),
          )}
        >
          <p className="whitespace-pre-wrap break-words text-pretty">
            {message.content}
            {/*
              Espaçador invisível: reserva, no FLUXO do texto, a largura que o
              horário (+ tick) ocupa no canto. Sem ele, a última linha passaria
              por baixo do `MessageMeta` absoluto. É exatamente a técnica da
              referência — e é o que faz uma bolha curta crescer o tanto certo
              para o horário caber ao lado, em vez de descer uma linha.
            */}
            <span className={cn('inline-block h-1', outbound ? 'w-[62px]' : 'w-[44px]')} aria-hidden="true" />
          </p>
          <MessageMeta
            occurredAt={message.occurredAt}
            status={status}
            className="absolute bottom-[6px] right-[9px]"
          />
        </div>
      )}
      </div>

      {isMedia && message.content && (
        <p
          className={cn(
            'mt-[3px] px-1 text-[12.5px] leading-[1.45] text-muted-foreground',
            BUBBLE_MAX_WIDTH,
          )}
        >
          {message.content}
        </p>
      )}
    </li>
  );
}
