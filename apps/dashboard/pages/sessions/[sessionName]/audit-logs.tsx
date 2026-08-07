import type { GetServerSideProps } from 'next';

/**
 * Rota antiga (Fase 1, F1.5) — desativada no Redesign 2026-08-05 (R2):
 * "Auditoria" virou uma ABA de `/sessions/:sessionName/settings` (junto de
 * "Conexão" e "Equipe"), em vez de um item de rail próprio. Arquivo
 * preservado (o ambiente não permite apagar) só como redirect.
 */
export const getServerSideProps: GetServerSideProps = async (context) => {
  const sessionName = context.params?.sessionName;
  const destination =
    typeof sessionName === 'string'
      ? `/sessions/${encodeURIComponent(sessionName)}/settings?tab=audit`
      : '/';
  return { redirect: { destination, permanent: false } };
};

export default function DeprecatedAuditLogsRedirect(): null {
  return null;
}
