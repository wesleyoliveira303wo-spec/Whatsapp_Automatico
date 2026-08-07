import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import SessionLayout from '@/components/SessionLayout';
import ConversationInbox from '@/components/ConversationInbox';
import { requireProtectedPageSession } from '@/lib/auth';
import { pageTitle } from '@/lib/brand';

interface ConversationsPageProps {
  tenantId: string;
  sessionName: string;
}

/**
 * Conversas dentro da sessão (Milestone 6, Bloco M6H-2, ADR #76) — inbox
 * estilo WhatsApp/Telegram (lista + chat lado a lado, `ConversationInbox`).
 * Esta página é o estado "nenhuma conversa aberta"; `[conversationId].tsx`
 * renderiza o MESMO componente com uma conversa selecionada (ver docstring
 * de `ConversationInbox` para o porquê de serem dois arquivos, não um
 * catch-all).
 */
export const getServerSideProps: GetServerSideProps<ConversationsPageProps> = async (context) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  const session = guard.session;
  const sessionName = context.params?.sessionName;
  if (typeof sessionName !== 'string') {
    return { notFound: true };
  }
  return { props: { tenantId: session.tenantId, sessionName } };
};

export default function ConversationsPage({
  tenantId,
  sessionName,
}: ConversationsPageProps): JSX.Element {
  return (
    <SessionLayout tenantId={tenantId} sessionName={sessionName}>
      <Head>
        <title>{pageTitle(`Conversas · ${sessionName}`)}</title>
      </Head>
      <div className="h-full">
        <ConversationInbox sessionName={sessionName} />
      </div>
    </SessionLayout>
  );
}
