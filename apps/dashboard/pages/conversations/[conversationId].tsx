import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ConversationStatusBadge from '@/components/ConversationStatusBadge';
import ConversationActions from '@/components/ConversationActions';
import MessageTimeline from '@/components/MessageTimeline';
import MessageComposer from '@/components/MessageComposer';
import AiInteractionPanel from '@/components/AiInteractionPanel';
import { requireProtectedPageSession } from '@/lib/auth';
import { useConversationDetail } from '@/hooks/useConversationDetail';
import { useMessagesTimeline } from '@/hooks/useMessagesTimeline';
import { useAiInteractions } from '@/hooks/useAiInteractions';
import { formatDateTime, formatContactJid } from '@/lib/formatters';

interface ConversationDetailPageProps {
  tenantId: string;
  conversationId: string;
}

/**
 * Detalhe de uma conversa (Milestone 3, Bloco 6 — D26/D27/D28/D31/D34):
 * cabecalho com status ATUAL (D26: sem historico de transicoes neste
 * bloco), acoes de escalonamento com banner inline (D31), timeline de
 * mensagens com selo de IA por correlacao `messageId` (D27) e painel de
 * interacoes de IA embutido (D28 — sem pagina propria). Mesmo guard de
 * autenticacao das demais paginas protegidas.
 */
export const getServerSideProps: GetServerSideProps<ConversationDetailPageProps> = async (context) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  const session = guard.session;
  const conversationId = context.params?.conversationId;
  if (typeof conversationId !== 'string') {
    return { notFound: true };
  }
  return { props: { tenantId: session.tenantId, conversationId } };
};

export default function ConversationDetailPage({ tenantId, conversationId }: ConversationDetailPageProps): JSX.Element {
  const { conversation, loading, errorMessage, refresh, applyUpdate } = useConversationDetail(conversationId);
  const { messages, errorMessage: messagesError, refresh: refreshMessages } = useMessagesTimeline(conversationId);
  const { interactions, errorMessage: interactionsError, refresh: refreshInteractions } = useAiInteractions(conversationId);

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex flex-col flex-1">
        <Header tenantId={tenantId} />
        <main className="flex-1 space-y-6 overflow-y-auto p-6">
          <Link href="/conversations" className="text-sm text-primary hover:underline">
            ← Voltar para conversas
          </Link>

          {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

          {loading ? (
            <p className="text-sm text-gray-500">Carregando conversa…</p>
          ) : conversation ? (
            <>
              <section className="flex items-start justify-between rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div>
                  <h1 className="text-xl font-bold text-gray-800">{formatContactJid(conversation.contactJid)}</h1>
                  <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600">
                    <dt className="text-gray-400">Sessao WhatsApp</dt>
                    <dd>{conversation.sessionName}</dd>
                    <dt className="text-gray-400">Iniciada em</dt>
                    <dd>{formatDateTime(conversation.createdAt)}</dd>
                    <dt className="text-gray-400">Ultima atualizacao</dt>
                    <dd>{formatDateTime(conversation.updatedAt)}</dd>
                  </dl>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <ConversationStatusBadge status={conversation.status} />
                  <button type="button" onClick={refresh} className="text-xs text-gray-500 hover:text-gray-700 hover:underline">
                    Atualizar
                  </button>
                </div>
              </section>

              <section>
                <ConversationActions conversationId={conversation.id} status={conversation.status} onUpdated={applyUpdate} />
              </section>

              <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-700">Mensagens</h2>
                  <button
                    type="button"
                    onClick={refreshMessages}
                    className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
                  >
                    Atualizar
                  </button>
                </div>
                <MessageTimeline
                  messages={messages}
                  interactions={interactions}
                  errorMessage={messagesError}
                  onRetry={refreshMessages}
                />
                {conversation.status === 'human' ? (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <MessageComposer conversationId={conversation.id} onSent={refreshMessages} />
                  </div>
                ) : (
                  <p className="mt-4 border-t border-gray-100 pt-4 text-xs text-gray-400">
                    A IA está respondendo esta conversa. Clique em “Assumir conversa” acima para responder você mesmo.
                  </p>
                )}
              </section>

              <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-700">Interacoes de IA</h2>
                  <button
                    type="button"
                    onClick={refreshInteractions}
                    className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
                  >
                    Atualizar
                  </button>
                </div>
                <AiInteractionPanel interactions={interactions} errorMessage={interactionsError} onRetry={refreshInteractions} />
              </section>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
