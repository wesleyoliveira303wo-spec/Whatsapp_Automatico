import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowDown, RefreshCw } from 'lucide-react';
import ConversationStatusBadge from './ConversationStatusBadge';
import ConversationActions from './ConversationActions';
import MessageTimeline from './MessageTimeline';
import MessageComposer from './MessageComposer';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/states/ErrorState';
import { useConversationDetail } from '@/hooks/useConversationDetail';
import { useMessagesTimeline } from '@/hooks/useMessagesTimeline';
import { useAiInteractions } from '@/hooks/useAiInteractions';
import { formatContactDisplayNameParts } from '@/lib/formatters';
import { markConversationAsRead, type ConversationSummary } from '@/lib/clientApi';
import ContactAvatar from './ContactAvatar';
import DisplayNameParts from './DisplayNameParts';

interface ConversationDetailPanelProps {
  sessionName: string;
  conversationId: string;
  /**
   * Notifica quem renderiza este painel (`ConversationInbox`) sempre que a
   * conversa muda por uma ação tomada AQUI DENTRO (hoje: marcar como lida) —
   * 2026-07-26. Sem isso, o badge de não lidas na lista ao lado só some no
   * próximo tick do SSE (~2s), o que pareceu "não sumir" para quem testou.
   * Optional: nenhuma outra tela usa este painel fora do inbox hoje.
   */
  onConversationUpdated?: (conversation: ConversationSummary) => void;
  /** Fase 1 (2026-08-07) — Botão POWER da sessão, repassado ao `ConversationStatusBadge` do cabeçalho. Default `true`. */
  aiEnabled?: boolean;
}

/**
 * Painel de conversa aberta (Milestone 6, Bloco M6H-2, ADR #76) — extraído da
 * antiga página de detalhe cheia de `Card`s empilhados para caber no painel
 * direito do inbox estilo WhatsApp/Telegram: cabeçalho compacto, mensagens
 * ocupando o espaço disponível (rola sozinho), composer fixo embaixo.
 *
 * Redesign 2026-08-05 (R3): o `<details>` "Interações de IA" que vivia no
 * rodapé migrou para a 3ª coluna (`ConversationContextPanel`) — este
 * componente segue chamando `useAiInteractions` (só a lista, sem
 * error/refresh próprios) porque a TIMELINE ainda precisa da correlação
 * `messageId → AiInteraction` para o selo "Gerada por IA" em cada bolha.
 *
 * `ArrowLeft` (link para a lista) só aparece em telas estreitas (`lg:hidden`)
 * — no desktop a lista já está sempre visível ao lado (`ConversationInbox`).
 *
 * Bloco M6H-2b (pedido do fundador): cabeçalho ganhou `ContactAvatar` (foto
 * de perfil ao vivo, com fallback de iniciais) e o título passou a mostrar
 * `contactName` (pushName do WhatsApp) quando disponível, em vez de sempre o
 * número — ver `formatContactDisplayName`.
 */
export default function ConversationDetailPanel({
  sessionName,
  conversationId,
  onConversationUpdated,
  aiEnabled = true,
}: ConversationDetailPanelProps): JSX.Element {
  const { conversation, loading, errorMessage, refresh, applyUpdate } =
    useConversationDetail(conversationId);
  const {
    messages,
    errorMessage: messagesError,
    refresh: refreshMessages,
  } = useMessagesTimeline(conversationId);
  const { interactions } = useAiInteractions(conversationId);

  // Milestone 6, Bloco M6H-2 (pedido do fundador): abrir uma conversa sempre
  // pula para a ÚLTIMA mensagem (padrão "PgDn"), sem exigir rolar manualmente.
  //
  // CORREÇÃO DE UX 2026-08-01 (validação Fase 1, pedido do fundador): o
  // reposicionamento automático estava disparando a cada poll de ~4s
  // (`usePollingRefresh`/`useMessagesTimeline`), mesmo SEM mensagem nova —
  // o hook troca `messages` por uma nova referência a cada tick, o que
  // bastava para reexecutar este efeito. Resultado: ao rolar o histórico
  // pra cima, o operador era arrancado de volta ao fim assim que o próximo
  // poll chegasse, tornando impraticamente ler mensagens antigas. Padrão
  // adotado agora, igual WhatsApp Web/Telegram/Discord/Slack:
  //   1. abrir a conversa pela 1ª vez → sempre pula para o fim;
  //   2. navegação manual pelo histórico → NUNCA reposiciona sozinho, não
  //      importa quantos polls aconteçam nesse meio tempo;
  //   3. só volta ao fim automaticamente quando (a) chega mensagem NOVA de
  //      verdade (por id, não por referência do array) E o operador já
  //      estava perto do fim, ou (b) o operador clica no botão flutuante
  //      "Ir para mensagens recentes" (aparece quando ele está fora do fim).
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const previousConversationIdRef = useRef<string | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const [showJumpToRecent, setShowJumpToRecent] = useState(false);

  const scrollToBottom = (behavior: ScrollBehavior = 'auto'): void => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
    nearBottomRef.current = true;
    setShowJumpToRecent(false);
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const NEAR_BOTTOM_THRESHOLD_PX = 150;
    const handleScroll = (): void => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      const isNearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX;
      nearBottomRef.current = isNearBottom;
      setShowJumpToRecent(!isNearBottom);
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
    // Depende de `loading`: no primeiro commit (`loading=true`) o Skeleton é
    // renderizado no lugar deste container, então `scrollContainerRef.current`
    // é `null` e o efeito não anexa nada. Sem essa dependência, o efeito nunca
    // roda de novo quando `loading` vira `false` e o container real aparece —
    // o listener de scroll nunca seria registrado (bug encontrado via
    // `npm test`, 2026-08-01).
  }, [loading]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || messages === null) return;

    const isNewConversation = previousConversationIdRef.current !== conversationId;
    const currentLastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
    const hasNewMessage = !isNewConversation && currentLastMessageId !== lastMessageIdRef.current;

    if (isNewConversation) {
      // Abertura da conversa: pula direto pro fim, sem animação (não é uma
      // mensagem "chegando", é o estado inicial).
      container.scrollTop = container.scrollHeight;
      nearBottomRef.current = true;
      setShowJumpToRecent(false);
    } else if (hasNewMessage && nearBottomRef.current) {
      // Mensagem nova de verdade + operador já estava no fim: acompanha.
      container.scrollTop = container.scrollHeight;
    }
    // Nos demais casos (poll sem novidade, ou mensagem nova com o operador
    // lendo o histórico) — deliberadamente NÃO mexe no scroll.

    previousConversationIdRef.current = conversationId;
    lastMessageIdRef.current = currentLastMessageId;
  }, [conversationId, messages]);

  // Indicador de não lidas (2026-07-25; corrigido 2026-07-26): abrir a
  // conversa marca tudo como lido. CORREÇÃO: rodar só em `[conversationId]`
  // marcava como lida uma única vez, na abertura — se chegasse mensagem
  // NOVA enquanto a conversa continuava aberta (caso comum: IA respondendo
  // em tempo real), `unreadCount` subia de novo no banco e o badge voltava
  // a aparecer na lista, sem nunca mais ser zerado enquanto o operador não
  // trocasse de conversa e voltasse. Agora também depende de `messages` —
  // toda vez que uma mensagem nova chega (poll de `useMessagesTimeline`) COM
  // a conversa já aberta, ela é marcada como lida de novo. Continua só
  // chamando a API quando há de fato algo não lido (`unreadCount > 0`) —
  // evita uma chamada supérflua a cada poll sem mensagem nova.
  useEffect(() => {
    if (!conversation || conversation.unreadCount === 0) return;
    let cancelled = false;
    markConversationAsRead(conversationId)
      .then((updated) => {
        if (cancelled) return;
        applyUpdate(updated);
        onConversationUpdated?.(updated);
      })
      .catch(() => {
        // Silencioso: não marcar como lida não deve atrapalhar a leitura da
        // conversa em si — o operador só verá o badge continuar visível.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberadamente sem `conversation`/`applyUpdate`/`onConversationUpdated`: rodar por eles recriaria um loop (marcar como lida muda `conversation`, que dispararia o efeito de novo)
  }, [conversationId, messages]);

  if (loading) {
    return (
      <div className="flex h-full flex-col gap-4 p-4">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-full w-full rounded-lg" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="p-6">
        <ErrorState
          title="Não foi possível carregar esta conversa"
          description={errorMessage ?? 'Verifique se o link está correto e tente novamente.'}
          onRetry={refresh}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[60px] shrink-0 items-center gap-3 border-b border-border px-[18px]">
        <Link
          href={`/sessions/${encodeURIComponent(sessionName)}/conversations`}
          className="-ml-1.5 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted lg:hidden"
          aria-label="Voltar para a lista"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <ContactAvatar
          sessionName={conversation.sessionName}
          contactJid={conversation.contactJid}
          contactName={conversation.contactName}
          savedContactName={conversation.savedContactName}
          className="h-[34px] w-[34px] text-[12.5px]"
        />
        {/* 2026-08-28 (pedido do fundador): removida a linha "Sessão: X" —
            qual WhatsApp está aberto já é evidente pelo rail/URL. O cabeçalho
            virou uma linha só: nome + selo de status, centralizados. */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 className="truncate text-[14.5px] font-semibold tracking-tight text-foreground">
            <DisplayNameParts
              {...formatContactDisplayNameParts(
                conversation.contactJid,
                conversation.contactName,
                conversation.savedContactName,
              )}
            />
          </h2>
          <ConversationStatusBadge
            status={conversation.status}
            escalatedAt={conversation.escalatedAt}
            aiEnabled={aiEnabled}
          />
        </div>
        <ConversationActions
          conversationId={conversation.id}
          status={conversation.status}
          excludedFromPipeline={conversation.excludedFromPipeline}
          onUpdated={applyUpdate}
        />
        <button
          type="button"
          title="Atualizar"
          aria-label="Atualizar conversa"
          onClick={refresh}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {errorMessage && (
        <p className="border-b border-border px-4 py-2 text-sm text-destructive">{errorMessage}</p>
      )}

      {/*
        Reskin 2026-08-28 (pedido do fundador) — o papel de parede passou a
        envolver TAMBÉM a barra do composer: era um contêiner só para a lista
        de mensagens, agora é um flex-column que vai até o rodapé. A barra do
        composer fica transparente (o wallpaper aparece atrás), e a cápsula
        branca do `MessageComposer` "flutua" sobre ele — como no WhatsApp Web.
      */}
      <div className="chat-wallpaper relative flex min-h-0 flex-1 flex-col">
        {/*
          Reskin 2026-08-27 — margem lateral generosa no desktop (as bolhas
          não devem colar nas bordas, como na referência) e enxuta no mobile,
          onde cada pixel de largura conta. Só esta lista rola; a barra do
          composer abaixo fica fixa, ambas por cima do papel de parede.
        */}
        <div
          ref={scrollContainerRef}
          className="fx-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2 sm:px-6 lg:px-[7%]"
        >
          <MessageTimeline
            messages={messages}
            interactions={interactions}
            errorMessage={messagesError}
            onRetry={refreshMessages}
          />
        </div>
        {showJumpToRecent && (
          <button
            type="button"
            onClick={() => scrollToBottom('smooth')}
            className="absolute bottom-[74px] right-4 flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-md transition-colors hover:bg-muted"
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            Ir para mensagens recentes
          </button>
        )}

        <div className="shrink-0 px-3 py-2.5 sm:px-4">
          {conversation.status === 'human' ? (
            <MessageComposer
              conversationId={conversation.id}
              sessionName={sessionName}
              onSent={refreshMessages}
            />
          ) : conversation.escalatedAt ? (
            <p className="text-xs font-medium text-warning">
              A IA pediu ajuda humana nesta conversa e continua respondendo enquanto ninguém
              assume. Clique em &quot;Assumir conversa&quot; acima para atender você mesmo.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              A IA está respondendo esta conversa. Clique em &quot;Assumir conversa&quot; acima para
              responder você mesmo.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
