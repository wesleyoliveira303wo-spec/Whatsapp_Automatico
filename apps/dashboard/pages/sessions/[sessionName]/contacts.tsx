import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import SessionLayout from '@/components/SessionLayout';
import ContactsPanel from '@/components/ContactsPanel';
import { requireProtectedPageSession } from '@/lib/auth';
import { pageTitle } from '@/lib/brand';
import type { ManagedUserRole } from '@/lib/clientApi';

interface ContactsPageProps {
  tenantId: string;
  sessionName: string;
  canManage: boolean;
}

/**
 * Contatos (Fase L, Blocos L1/L1b) — item PRÓPRIO do rail principal, entre
 * Conversas e Pipeline (pedido do fundador, 2026-08-15). Antes vivia como
 * aba "Leads" dentro de Configurações; migrou para cá porque é destino de
 * trabalho do dia a dia (consultar/importar a base de contatos), não uma tela
 * administrativa — mesmo raciocínio que já separa Conversas/Pipeline de
 * Configurações.
 *
 * `canManage` (administrator/owner) é resolvido no SERVIDOR — mesmo padrão
 * de `settings.tsx` — para a UI já nascer correta, sem um flash em que o
 * botão de importar aparece e some.
 */
export const getServerSideProps: GetServerSideProps<ContactsPageProps> = async (context) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  const { session } = guard;
  const sessionName = context.params?.sessionName;
  if (typeof sessionName !== 'string') {
    return { notFound: true };
  }
  const role = (session.user?.role as ManagedUserRole | undefined) ?? null;
  const canManage = role === 'administrator' || role === 'owner';
  return { props: { tenantId: session.tenantId, sessionName, canManage } };
};

export default function ContactsPage({
  tenantId,
  sessionName,
  canManage,
}: ContactsPageProps): JSX.Element {
  return (
    <SessionLayout tenantId={tenantId} sessionName={sessionName}>
      <Head>
        <title>{pageTitle(`Contatos · ${sessionName}`)}</title>
      </Head>
      <div className="fx-scroll h-full overflow-y-auto">
        {/* Largura maior que as demais telas de sessão (840px): esta tem duas
            colunas (lista + painel de campanhas) a partir de `xl`. */}
        <div className="max-w-[1400px] px-6 pb-12 pt-5">
          <h1 className="text-[21px] font-semibold tracking-tight text-foreground">Contatos</h1>
          <p className="mb-5 mt-1 text-[13px] text-muted-foreground">
            Base de contatos da empresa — criada automaticamente quando alguém escreve no WhatsApp,
            ou importada de uma planilha.
          </p>

          <ContactsPanel canManage={canManage} />
        </div>
      </div>
    </SessionLayout>
  );
}
