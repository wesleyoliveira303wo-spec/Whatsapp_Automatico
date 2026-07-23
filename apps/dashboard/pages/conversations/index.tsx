import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ConversationFilterTabs from '@/components/ConversationFilterTabs';
import ConversationListItem from '@/components/ConversationListItem';
import LoadMoreButton from '@/components/LoadMoreButton';
import { requireProtectedPageSession } from '@/lib/auth';
import { useConversationsList } from '@/hooks/useConversationsList';
import type { ConversationStatus } from '@/lib/clientApi';

interface ConversationsPageProps {
  tenantId: string;
}

/**
 * Lista de conversas do tenant (Milestone 3, Bloco 6 — D23/D24/D25/D34).
 * Mesmo guard de autenticacao das paginas da M2 (`requirePageSession` via
 * `getServerSideProps`). Primeira pagina viva via SSE; "Carregar mais"
 * via fetch simples; filtro resolvido no servidor.
 */
export const getServerSideProps: GetServerSideProps<ConversationsPageProps> = async (context) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  const session = guard.session;
  return { props: { tenantId: session.tenantId } };
};

export default function ConversationsPage({ tenantId }: ConversationsPageProps): JSX.Element {
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | undefined>(undefined);
  const { conversations, loading, errorMessage, connected, loadMore, loadingMore, hasMore } =
    useConversationsList(statusFilter);

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex flex-col flex-1">
        <Header tenantId={tenantId} />
        <main className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-800">Conversas</h1>
            <ConversationFilterTabs value={statusFilter} onChange={setStatusFilter} />
          </div>

          {!connected && <p className="text-sm text-yellow-700">Reconectando ao servidor…</p>}
          {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

          {loading ? (
            <p className="text-sm text-gray-500">Carregando conversas…</p>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-gray-500">
              {statusFilter ? 'Nenhuma conversa com este status.' : 'Nenhuma conversa ainda. Elas aparecem aqui quando um contato manda mensagem.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {conversations.map((conversation) => (
                <ConversationListItem key={conversation.id} conversation={conversation} />
              ))}
              <LoadMoreButton onClick={loadMore} loading={loadingMore} hasMore={hasMore} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
