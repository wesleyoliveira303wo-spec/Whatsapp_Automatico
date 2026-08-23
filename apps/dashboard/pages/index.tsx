import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { motion } from 'framer-motion';
import { staggerContainer } from '@/lib/motion';
import { Plus, Smartphone } from 'lucide-react';
import Header from '@/components/Header';
import ConnectWhatsAppDialog from '@/components/ConnectWhatsAppDialog';
import WhatsAppAccountCard from '@/components/WhatsAppAccountCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/states/EmptyState';
import { requireProtectedPageSession } from '@/lib/auth';
import { useSessionsList } from '@/hooks/useSessionsList';
import { useWaitingForHuman } from '@/hooks/useWaitingForHuman';
import { pageTitle } from '@/lib/brand';

interface HomeProps {
  tenantId: string;
}

/**
 * Workspace — nível 1 de navegação (Milestone 6, Bloco M6H-1, ADR #74).
 * A ÚNICA função desta tela é administrar sessões do WhatsApp: nenhuma
 * `Sidebar`, nenhum atalho de Conversas/Analytics/Cérebro da IA/Equipe — isso
 * tudo vive dentro de CADA sessão (`SessionLayout`), acessível só depois de
 * escolher qual WhatsApp administrar. Página protegida:
 * `getServerSideProps` exige sessão válida antes de renderizar.
 *
 * Cada card mostra um indicador simples e real: conversas aguardando
 * atendimento humano NAQUELA sessão (`useWaitingForHuman().countBySession` —
 * dado que já chega no cliente, sem endpoint novo). "Quantidade de conversas"
 * e "IA ativa" (pedidos originalmente) ficam de fora por ora: o primeiro
 * exigiria um endpoint de contagem que ainda não existe, e o segundo não tem
 * nenhum estado real por trás (não existe hoje um botão de pausar a IA por
 * sessão) — mostrar os dois seria inventar dado, não indicador.
 */
export const getServerSideProps: GetServerSideProps<HomeProps> = async (context) => {
  const guard = requireProtectedPageSession(context);
  if (guard.kind === 'redirect') {
    return { redirect: guard.redirect };
  }
  return { props: { tenantId: guard.session.tenantId } };
};

export default function Home({ tenantId }: HomeProps): JSX.Element {
  const { sessions, loading, errorMessage, connected } = useSessionsList();
  const { countBySession } = useWaitingForHuman();

  return (
    <div className="flex h-screen flex-col bg-muted/30">
      <Head>
        <title>{pageTitle('WhatsApps')}</title>
      </Head>
      <Header tenantId={tenantId} />
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            {/*
              ONDA 1 DO REDESIGN (2026-08-22) — `text-2xl` (24px) não existe
              na escala tipográfica do Design System (`DESIGN_SYSTEM.md` §3:
              "escala fixa — nunca inventar um tamanho fora desta lista":
              21/17/15.5-13/12.5/11.5). O Workspace é a PRIMEIRA tela que
              todo cliente novo vê, e era a única com um tamanho de título
              inventado — 21px é o passo real da escala para "Título de tela
              (H1)", já usado em Pipeline/Analytics/Contatos/Campanhas.
            */}
            <h1 className="text-[21px] font-semibold tracking-tight text-foreground">
              Seus WhatsApps
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Conecte e gerencie os números que o Francis atende.
            </p>
          </div>
          {sessions.length > 0 && (
            <ConnectWhatsAppDialog
              trigger={
                <Button>
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Conectar WhatsApp
                </Button>
              }
            />
          )}
        </div>

        {!connected && <p className="mb-4 text-sm text-warning">Reconectando ao servidor…</p>}
        {errorMessage && <p className="mb-4 text-sm text-destructive">{errorMessage}</p>}

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={Smartphone}
            title="Conecte seu primeiro WhatsApp"
            description="Escaneie um QR Code para o Francis começar a atender seus clientes automaticamente."
            action={
              <ConnectWhatsAppDialog
                trigger={
                  <Button>
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Conectar WhatsApp
                  </Button>
                }
              />
            }
          />
        ) : (
          /*
            Onda 2 do redesign (2026-08-23) — o Workspace é a PRIMEIRA tela
            depois do login; os cards entrando em cascata é a primeira
            impressão de movimento do produto inteiro. Ver `lib/motion.ts`.
          */
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            {sessions.map((session) => (
              <WhatsAppAccountCard
                key={session.id}
                session={session}
                waitingCount={countBySession[session.sessionName] ?? 0}
              />
            ))}
          </motion.div>
        )}
      </main>
    </div>
  );
}
