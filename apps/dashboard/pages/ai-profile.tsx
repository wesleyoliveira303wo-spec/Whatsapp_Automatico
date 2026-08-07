import type { GetServerSideProps } from 'next';

/**
 * Rota antiga (M2, Fase 4) — desativada na Milestone 6, Bloco M6H-1b: o
 * Cérebro da IA agora vive dentro da sessão (`/sessions/:sessionName/ai-profile`,
 * ADR #74), porque não existe mais uma navegação tenant-wide. Redireciona
 * para o Workspace em vez de dar 404 num link/favorito antigo.
 */
export const getServerSideProps: GetServerSideProps = async () => {
  return { redirect: { destination: '/', permanent: false } };
};

export default function DeprecatedAiProfileRedirect(): null {
  return null;
}
