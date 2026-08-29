import type { GetServerSideProps } from 'next';

/**
 * Rota antiga (Milestone 5, Bloco M5F-3) — desativada na Milestone 6, Bloco
 * M6H-1b: "Usuários" virou "Equipe" e agora vive dentro da sessão
 * (`/sessions/:sessionName/users`, ADR #74). Redireciona para o Workspace em
 * vez de dar 404 num link/favorito antigo.
 */
export const getServerSideProps: GetServerSideProps = async () => {
  return { redirect: { destination: '/app', permanent: false } };
};

export default function DeprecatedUsersRedirect(): null {
  return null;
}
