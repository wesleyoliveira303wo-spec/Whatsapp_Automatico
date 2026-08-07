import type { GetServerSideProps } from 'next';

/**
 * Rota antiga (M2, renomeada M6H-1) — a página solta de "Configurações"
 * virou a aba "Conexão" de `/sessions/:sessionName/settings` no Redesign
 * 2026-08-05 (R2). Conteúdo real agora em `components/SessionConnectionPanel.tsx`.
 * Arquivo preservado (o ambiente não permite apagar) só como redirect.
 */
export const getServerSideProps: GetServerSideProps = async (context) => {
  const sessionName = context.params?.sessionName;
  const destination =
    typeof sessionName === 'string' ? `/sessions/${encodeURIComponent(sessionName)}/settings` : '/';
  return { redirect: { destination, permanent: false } };
};

export default function DeprecatedSessionDetailRedirect(): null {
  return null;
}
