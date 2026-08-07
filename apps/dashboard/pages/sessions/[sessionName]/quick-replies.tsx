import type { GetServerSideProps } from 'next';

/**
 * Rota antiga (Fase 1, F1.9) — desativada no Redesign 2026-08-05 (R2):
 * "Respostas Rápidas" virou uma ABA de `/sessions/:sessionName/ai` (junto de
 * "Cérebro da IA"), em vez de um item de rail próprio. Arquivo preservado (o
 * ambiente não permite apagar) só como redirect.
 */
export const getServerSideProps: GetServerSideProps = async (context) => {
  const sessionName = context.params?.sessionName;
  const destination =
    typeof sessionName === 'string'
      ? `/sessions/${encodeURIComponent(sessionName)}/ai?tab=quick-replies`
      : '/';
  return { redirect: { destination, permanent: false } };
};

export default function DeprecatedQuickRepliesRedirect(): null {
  return null;
}
