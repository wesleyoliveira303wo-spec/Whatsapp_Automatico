import type { GetServerSideProps } from 'next';

/**
 * Rota antiga (Milestone 3, Bloco 6) — desativada na Milestone 6, Bloco
 * M6H-1b: o detalhe de uma conversa agora vive dentro da sessão
 * (`/sessions/:sessionName/conversations/:conversationId`, ADR #74).
 * Redireciona para o Workspace em vez de dar 404 num link/favorito antigo
 * (não é possível redirecionar direto para o detalhe certo aqui: exigiria
 * uma chamada à API só para descobrir a sessão da conversa a partir do id —
 * custo não justificado para um link legado).
 */
export const getServerSideProps: GetServerSideProps = async () => {
  return { redirect: { destination: '/', permanent: false } };
};

export default function DeprecatedConversationDetailRedirect(): null {
  return null;
}
