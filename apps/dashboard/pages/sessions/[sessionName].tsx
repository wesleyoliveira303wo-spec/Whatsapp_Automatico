import type { GetServerSideProps } from 'next';

/**
 * Entrada de uma sessão de WhatsApp (`/sessions/:sessionName`) — é para onde
 * o card do Workspace (`WhatsAppAccountCard`) aponta.
 *
 * CORREÇÃO 2026-08-27 (achado real do fundador, mesma sessão da
 * Reorganização Perfil/Configurações — ver DECISIONS.md #106): esta rota
 * redirecionava para `/sessions/:s/settings` desde o Redesign 2026-08-05
 * (R2), quando a página solta de detalhe da sessão virou a aba "Conexão" de
 * Configurações. Já era discutível antes (clicar no card do Workspace caía
 * em Configurações, não no trabalho do dia a dia), mas ficou QUEBRADO de vez
 * quando `/sessions/:s/settings` também virou redirect (para `/settings`,
 * nível tenant): a cadeia `card → :s → :s/settings → /settings` fazia o
 * clique numa sessão sair completamente do contexto dela e cair nas
 * Configurações globais — o Dashboard (Conversas/Pipeline/Contatos/…)
 * ficava inalcançável pela navegação normal.
 *
 * Agora aponta para `conversations` — a tela de trabalho principal e o
 * primeiro item do `SessionRail`. Configurações continua a um clique, pela
 * engrenagem no rodapé do rail.
 */
export const getServerSideProps: GetServerSideProps = async (context) => {
  const sessionName = context.params?.sessionName;
  const destination =
    typeof sessionName === 'string'
      ? `/sessions/${encodeURIComponent(sessionName)}/conversations`
      : '/';
  return { redirect: { destination, permanent: false } };
};

export default function SessionEntryRedirect(): null {
  return null;
}
