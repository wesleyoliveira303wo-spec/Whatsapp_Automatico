import type { GetServerSideProps } from 'next';

/**
 * Rota antiga (M6H-1b) — desativada no Redesign 2026-08-05 (R2): "Equipe"
 * virou uma ABA de `/sessions/:sessionName/settings` (junto de "Conexão" e
 * "Auditoria"), em vez de um item de rail próprio. Arquivo preservado (o
 * ambiente não permite apagar) só como redirect.
 */
export const getServerSideProps: GetServerSideProps = async (context) => {
  const sessionName = context.params?.sessionName;
  const destination =
    typeof sessionName === 'string'
      ? `/sessions/${encodeURIComponent(sessionName)}/settings?tab=team`
      : '/';
  return { redirect: { destination, permanent: false } };
};

export default function DeprecatedUsersRedirect(): null {
  return null;
}
