import { useMemo, useState } from 'react';
import { MessageCircle, Search } from 'lucide-react';
import ConversationFilterTabs, { type ConversationFilterValue } from './ConversationFilterTabs';
import ConversationListItem from './ConversationListItem';
import ConversationDetailPanel from './ConversationDetailPanel';
import ConversationContextPanel from './ConversationContextPanel';
import LoadMoreButton from './LoadMoreButton';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/states/EmptyState';
import { useConversationsList } from '@/hooks/useConversationsList';
import { useAiToggleContext } from '@/contexts/AiToggleContext';
import { formatContactJid } from '@/lib/formatters';
import type { ConversationStatus } from '@/lib/clientApi';
import { cn } from '@/lib/utils';

interface ConversationInboxProps {
  sessionName: string;
  /** Ausente = nenhuma conversa aberta (painel direito mostra um convite a escolher uma). */
  selectedConversationId?: string;
}

/**
 * Inbox de conversas da sessão — Milestone 6, Bloco M6H-2 (ADR #76): lista +
 * chat lado a lado, inspirado em WhatsApp Desktop/Telegram.
 *
 * Redesign 2026-08-05 (R3): ganhou uma 3ª coluna (`ConversationContextPanel`,
 * só em telas `xl:` 1280px+) e o filtro cresceu de 3 para 5 opções
 * (`ConversationFilterTabs`). Dois tipos de filtro coexistem — nunca
 * combinados na mesma consulta, porque a UI só deixa escolher um por vez:
 * - `bot`/`human`/`waiting` viram `status`/`needsHumanAttention` no
 *   SERVIDOR (trocam a URL do SSE via `useConversationsList`).
 * - `unread` filtra no CLIENTE (`unreadCount > 0`), mesma natureza da busca
 *   por texto — não alcança o que ainda não foi carregado.
 *
 * A busca por texto (client-side, sobre o já carregado) agora considera
 * `contactName` e `lastMessagePreview` além do número — continua sem tocar a
 * paginação por cursor do servidor.
 *
 * Responsivo: abaixo de `lg`, mostra SÓ a lista OU SÓ a conversa aberta
 * (nunca as duas) — a lista reaparece ao voltar (`ConversationDetailPanel`
 * tem o botão de voltar). Em `lg+`, lista+chat; em `xl+`, lista+chat+contexto.
 *
 * Duas páginas (`conversations/index.tsx` e `conversations/[conversationId].tsx`)
 * renderizam este MESMO componente — o ambiente não permite um roteador
 * "catch-all" sem conflitar com os arquivos já existentes, então navegar
 * entre "sem conversa aberta" e "com uma aberta" remonta a lista (reset
 * breve, reconectando via SSE em ~1-2s) em vez de preservar o scroll
 * perfeitamente. Trade-off aceito e documentado — muito melhor que o 404 ou
 * o layout empilhado de antes.
 */
export default function ConversationInbox({
  sessionName,
  selectedConversationId,
}: ConversationInboxProps): JSX.Element {
  const [filter, setFilter] = useState<ConversationFilterValue>('all');
  const [search, setSearch] = useState('');

  // Fase 1 (2026-08-07) — Botão POWER: lido do MESMO estado compartilhado do
  // botão no cabeçalho (`AiToggleProvider`, montado por `SessionLayout`) —
  // clicar no botão atualiza os selos aqui na mesma renderização, sem F5.
  // `?? true` enquanto o estado inicial não chegou: nunca mostra "IA
  // desativada" por engano antes de saber o valor real.
  const { aiEnabled: sessionAiEnabled } = useAiToggleContext();
  const aiEnabled = sessionAiEnabled ?? true;

  const statusParam: ConversationStatus | undefined =
    filter === 'bot' || filter === 'human' ? filter : undefined;
  const needsHumanAttentionParam = filter === 'waiting' ? true : undefined;

  const {
    conversations,
    loading,
    errorMessage,
    connected,
    loadMore,
    loadingMore,
    hasMore,
    applyLocalUpdate,
  } = useConversationsList(statusParam, sessionName, needsHumanAttentionParam);

  const visibleConversations = useMemo(() => {
    let list = conversations;
    if (filter === 'unread') {
      list = list.filter((conversation) => conversation.unreadCount > 0);
    }
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (conversation) =>
          formatContactJid(conversation.contactJid).toLowerCase().includes(term) ||
          (conversation.contactName ?? '').toLowerCase().includes(term) ||
          (conversation.lastMessagePreview ?? '').toLowerCase().includes(term),
      );
    }
    return list;
  }, [conversations, search, filter]);

  const hasSelection = Boolean(selectedConversationId);
  const hasActiveFilter = filter !== 'all';

  return (
    <div className="flex h-full">
      {/* Lista — coluna esquerda. Reskin 2026-08-06: fundo `panel` (#FAFAF9,
          distinto do `card` do chat central), largura 344px (não mais 320),
          sem `border-b` separando busca/filtros do resto — o espaço já
          resolve a hierarquia (Design System §1). */}
      <div
        className={cn(
          'w-full flex-col bg-panel lg:flex lg:w-[344px] lg:shrink-0 lg:border-r lg:border-border',
          hasSelection ? 'hidden' : 'flex',
        )}
      >
        <div className="flex flex-col gap-3 px-4 pb-2.5 pt-4">
          <div className="flex items-baseline justify-between">
            <h1 className="text-[17px] font-semibold tracking-tight text-foreground">Conversas</h1>
            <span className="tabular-nums text-xs text-muted-foreground">
              {visibleConversations.length} de {conversations.length}
            </span>
          </div>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-[11px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar pessoa, número ou mensagem"
              className="h-[35px] rounded-[10px] pl-[33px] text-[13px]"
            />
          </div>
        </div>

        {/* `pb-0`: o próprio `ConversationFilterTabs` já reserva espaço (pb-2) entre os botões e a barra de rolagem horizontal — duplicar aqui deixaria o respiro grande demais. */}
        <div className="px-3">
          <ConversationFilterTabs value={filter} onChange={setFilter} />
        </div>

        {!connected && <p className="px-3 pt-2 text-xs text-warning">Reconectando ao servidor…</p>}
        {errorMessage && <p className="px-3 pt-2 text-xs text-destructive">{errorMessage}</p>}

        <div className="fx-scroll flex-1 overflow-y-auto px-2 pb-2">
          {loading ? (
            <div className="flex flex-col gap-2 p-1">
              <Skeleton className="h-[60px] w-full rounded-lg" />
              <Skeleton className="h-[60px] w-full rounded-lg" />
              <Skeleton className="h-[60px] w-full rounded-lg" />
            </div>
          ) : visibleConversations.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={MessageCircle}
                title={
                  search
                    ? 'Nenhum resultado'
                    : hasActiveFilter
                      ? 'Nenhuma conversa neste filtro'
                      : 'Nenhuma conversa ainda'
                }
                description={
                  search
                    ? 'Tente buscar por outro nome, número ou trecho de mensagem.'
                    : hasActiveFilter
                      ? 'Troque o filtro acima para ver conversas de outro tipo.'
                      : 'Elas aparecem aqui assim que um contato mandar mensagem neste WhatsApp.'
                }
              />
            </div>
          ) : (
            <>
              {visibleConversations.map((conversation) => (
                <ConversationListItem
                  key={conversation.id}
                  conversation={conversation}
                  active={conversation.id === selectedConversationId}
                  aiEnabled={aiEnabled}
                />
              ))}
              {!search && (
                <div className="p-3">
                  <LoadMoreButton onClick={loadMore} loading={loadingMore} hasMore={hasMore} />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Conversa aberta — coluna central */}
      <div className={cn('flex-1 flex-col bg-card lg:flex', hasSelection ? 'flex' : 'hidden')}>
        {selectedConversationId ? (
          <ConversationDetailPanel
            sessionName={sessionName}
            conversationId={selectedConversationId}
            onConversationUpdated={applyLocalUpdate}
            aiEnabled={aiEnabled}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState
              icon={MessageCircle}
              title="Selecione uma conversa"
              description="Escolha um contato na lista ao lado para ver a conversa."
            />
          </div>
        )}
      </div>

      {/* Contexto do contato — 3ª coluna, só em telas largas (xl:) */}
      {selectedConversationId && (
        <ConversationContextPanel
          sessionName={sessionName}
          conversationId={selectedConversationId}
          aiEnabled={aiEnabled}
        />
      )}
    </div>
  );
}
