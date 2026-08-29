import type { GetServerSideProps } from 'next';

/**
 * Rota antiga (Milestone 4) — desativada na Milestone 6, Bloco M6H-1b:
 * Analytics agora vive dentro da sessão (`/sessions/:sessionName/analytics`,
 * ADR #74). Redireciona para o Workspace em vez de dar 404 num link/favorito
 * antigo.
 */
export const getServerSideProps: GetServerSideProps = async () => {
  return { redirect: { destination: '/app', permanent: false } };
};

export default function DeprecatedAnalyticsRedirect(): null {
  return null;
}
