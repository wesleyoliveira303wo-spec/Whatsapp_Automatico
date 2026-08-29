import type { GetServerSideProps } from 'next';

/**
 * Rota antiga (Milestone 3, Bloco 6) — desativada na Milestone 6, Bloco
 * M6H-1b: Conversas agora vive dentro da sessão
 * (`/sessions/:sessionName/conversations`, ADR #74), porque não existe mais
 * uma navegação tenant-wide. Redireciona para o Workspace em vez de dar 404
 * num link/favorito antigo.
 */
export const getServerSideProps: GetServerSideProps = async () => {
  return { redirect: { destination: '/app', permanent: false } };
};

export default function DeprecatedConversationsRedirect(): null {
  return null;
}
