import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import SessionLayout from '@/components/SessionLayout';
import ConversationInbox from '@/components/ConversationInbox';
import { requireProtectedPageSession } from '@/lib/auth';
import { pageTitle } from '@/lib/brand';

interface ConversationDetailPageProps {
  tenantId: string;
  sessionName: string;
  conversationId: string;
}

/**
 * Conversa aberta dentro do inbox da sessão (Milestone 6, Bloco M6H-2, ADR
 * #76) — mesmo `ConversationInbox` de `conversations/index.tsx`, agora com
 * `selectedConversationId` preenchido (mostra a lista + o painel da
 * conversa lado a lado no desktop; só o painel no mobile).
 */
export const getServerSideProps: GetServerSideProps<ConversationDetailPageProps> = async (
  context,
) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  const session = guard.session;
  const sessionName = context.params?.sessionName;
  const conversationId = context.params?.conversationId;
  if (typeof sessionName !== 'string' || typeof conversationId !== 'string') {
    return { notFound: true };
  }
  return { props: { tenantId: session.tenantId, sessionName, conversationId } };
};

export default function ConversationDetailPage({
  tenantId,
  sessionName,
  conversationId,
}: ConversationDetailPageProps): JSX.Element {
  return (
    <SessionLayout tenantId={tenantId} sessionName={sessionName}>
      <Head>
        <title>{pageTitle(`Conversas · ${sessionName}`)}</title>
      </Head>
      <div className="h-full">
        <ConversationInbox sessionName={sessionName} selectedConversationId={conversationId} />
      </div>
    </SessionLayout>
  );
}
