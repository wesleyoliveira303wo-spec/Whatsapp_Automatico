import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import SessionLayout from '@/components/SessionLayout';
import AiProfilePanel from '@/components/AiProfilePanel';
import { requireProtectedPageSession } from '@/lib/auth';
import { pageTitle } from '@/lib/brand';

interface AiPageProps {
  tenantId: string;
  sessionName: string;
}

/**
 * Redesign 2026-08-25 — "Respostas Rápidas" SAIU desta página: a
 * funcionalidade (inserir e cadastrar frases prontas) migrou para dentro do
 * `MessageComposer`, no mesmo botão que já inseria as respostas na
 * conversa (pedido do fundador — não fazia sentido gerenciar num lugar e
 * usar em outro). Com isso, a pílula de 2 abas ("Cérebro da IA" /
 * "Respostas Rápidas") que existia aqui desde o Redesign 2026-08-05 (R2)
 * deixou de fazer sentido — só sobrou UM conteúdo, então a página volta a
 * ser direta, sem abas.
 *
 * `AiProfilePanel` já tem suas PRÓPRIAS 4 abas internas (Visão geral/
 * Conhecimento/Assistente Guiado/FAQ, Cérebro da IA v3) — nada muda aí.
 *
 * Rota antiga `/sessions/:s/quick-replies` (arquivo preservado, ambiente
 * não permite apagar) segue redirecionando pra cá com `?tab=quick-replies`
 * — o parâmetro agora é simplesmente ignorado (não há mais pra onde
 * alternar).
 */
export const getServerSideProps: GetServerSideProps<AiPageProps> = async (context) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  const { session } = guard;
  const role = session.user?.role;
  if (role !== 'administrator' && role !== 'owner') {
    return { redirect: { destination: '/', permanent: false } };
  }
  const sessionName = context.params?.sessionName;
  if (typeof sessionName !== 'string') {
    return { notFound: true };
  }
  return { props: { tenantId: session.tenantId, sessionName } };
};

export default function AiPage({ tenantId, sessionName }: AiPageProps): JSX.Element {
  return (
    <SessionLayout tenantId={tenantId} sessionName={sessionName}>
      <Head>
        <title>{pageTitle(`Cérebro da IA · ${sessionName}`)}</title>
      </Head>
      <div className="fx-scroll h-full overflow-y-auto">
        <div className="max-w-[1040px] px-6 pb-12 pt-5">
          <h1 className="text-[21px] font-semibold tracking-tight text-foreground">
            Cérebro da IA
          </h1>
          <p className="mb-5 mt-1 text-[13px] text-muted-foreground">
            O que o Francis sabe sobre o seu negócio.
          </p>

          <AiProfilePanel sessionName={sessionName} />
        </div>
      </div>
    </SessionLayout>
  );
}
