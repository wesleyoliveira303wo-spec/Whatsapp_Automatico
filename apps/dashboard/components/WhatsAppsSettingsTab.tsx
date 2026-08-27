import { useRouter } from 'next/router';
import { ArrowLeft, Plus, Smartphone } from 'lucide-react';
import ConnectWhatsAppDialog from '@/components/ConnectWhatsAppDialog';
import WhatsAppAccountCard from '@/components/WhatsAppAccountCard';
import SessionConnectionPanel from '@/components/SessionConnectionPanel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/states/EmptyState';
import { useSessionsList } from '@/hooks/useSessionsList';
import { useWaitingForHuman } from '@/hooks/useWaitingForHuman';

/**
 * Aba "WhatsApps" de Configurações (Reorganização Perfil/Configurações,
 * 2026-08-27) — lista TODAS as sessões do tenant (mesmos dados/cards do
 * Workspace, `useSessionsList`/`WhatsAppAccountCard`), porque esta aba
 * também é alcançável de FORA de qualquer sessão (engrenagem no Workspace).
 * DOIS modos, decididos pela URL (`?session=`) — 4ª rodada (2026-08-27),
 * mesclagem pedida pelo fundador. Antes desta rodada havia DUAS telas quase
 * idênticas com comportamentos DIFERENTES no clique (o Workspace `/`, cujo
 * card ENTRAVA na sessão, e esta aba, cujo card mostrava a DESCRIÇÃO) — a
 * semelhança visual com comportamento divergente era exatamente o que
 * confundia. Agora há um só significado por gesto:
 *
 * - COM `?session=`: a DESCRIÇÃO daquela conexão (status, número, QR,
 *   histórico, conectar/desconectar) — é onde o avatar do rail leva, para
 *   ver os dados da sessão em que se está trabalhando.
 * - SEM `?session=`: a LISTA de todos os WhatsApps (o "Workspace", agora
 *   morando aqui). Clicar num card ENTRA naquela sessão (Dashboard dela) —
 *   comportamento único, igual ao do Workspace antigo.
 *
 * A seleção vive na URL, não em `useState`: torna o estado deep-linkável
 * (Web Interface Guidelines: "URL reflects state") e é o que permite
 * `CreateSessionForm`/`SessionRail` apontarem direto para a descrição de
 * uma sessão. `shallow` evita re-rodar `getServerSideProps` ao voltar para
 * a lista — é troca de painel, não navegação de página.
 */
export default function WhatsAppsSettingsTab(): JSX.Element {
  const router = useRouter();
  const { sessions, loading, errorMessage } = useSessionsList();
  const { countBySession } = useWaitingForHuman();

  const rawSelected = router.query.session;
  const selected = typeof rawSelected === 'string' && rawSelected !== '' ? rawSelected : null;

  const setSelected = (sessionName: string | null): void => {
    const query = { ...router.query };
    if (sessionName) {
      query.session = sessionName;
    } else {
      delete query.session;
    }
    void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
  };

  if (selected) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Todos os WhatsApps
        </button>
        <SessionConnectionPanel sessionName={selected} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          Conecte e gerencie os números que o Francis atende.
        </p>
        {sessions.length > 0 && (
          <ConnectWhatsAppDialog
            trigger={
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Conectar WhatsApp
              </Button>
            }
          />
        )}
      </div>

      {errorMessage && (
        <p role="alert" aria-live="polite" className="mb-4 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/*
            O card ENTRA na sessão (Dashboard dela); o botão "Gerenciar"
            dentro dele leva à descrição desta mesma tela (`?session=`) —
            ver docstring de `WhatsAppAccountCard`.
          */}
          {sessions.map((session) => (
            <WhatsAppAccountCard
              key={session.id}
              session={session}
              waitingCount={countBySession[session.sessionName] ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
