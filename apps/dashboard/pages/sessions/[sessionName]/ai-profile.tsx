import type { GetServerSideProps } from 'next';

/**
 * Rota antiga (M6H-3) — desativada no Redesign 2026-08-05 (R2): "Cérebro da
 * IA" virou uma ABA de `/sessions/:sessionName/ai` (junto de "Respostas
 * Rápidas"), em vez de um item de rail próprio. Arquivo preservado (o
 * ambiente não permite apagar) só como redirect — nenhuma lógica de guard
 * aqui, a página de destino já valida sessão/cargo.
 */
export const getServerSideProps: GetServerSideProps = async (context) => {
  const sessionName = context.params?.sessionName;
  const destination =
    typeof sessionName === 'string'
      ? `/sessions/${encodeURIComponent(sessionName)}/ai?tab=profile`
      : '/';
  return { redirect: { destination, permanent: false } };
};

export default function DeprecatedAiProfileRedirect(): null {
  return null;
}
