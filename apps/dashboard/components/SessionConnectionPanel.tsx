import { useRouter } from 'next/router';
import { Smartphone } from 'lucide-react';
import QRCodeCard from '@/components/QRCodeCard';
import SessionActions from '@/components/SessionActions';
import HistoryList from '@/components/HistoryList';
import StatusDot from '@/components/StatusDot';
import ContactAvatar from '@/components/ContactAvatar';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/states/ErrorState';
import { useSessionDetail } from '@/hooks/useSessionDetail';
import { formatDateTime, formatStatusLabel } from '@/lib/formatters';

interface SessionConnectionPanelProps {
  sessionName: string;
}

/**
 * Redesign 2026-08-05 (R2) — extraído de `pages/sessions/[sessionName].tsx`
 * (a antiga página solta de "Configurações") para virar a aba "Conexão" de
 * `pages/sessions/[sessionName]/settings.tsx`. Conteúdo idêntico ao de
 * sempre (status, QR Code, ações, histórico) — só mudou de onde é montado.
 * Contrato de 4 estados preservado (`Skeleton`/`ErrorState`).
 *
 * Reskin 2026-08-07 (Design System, tela Configurações) — grade de 2
 * colunas (cartão de sessão + cartão de QR lado a lado; Histórico ocupa a
 * largura inteira embaixo), igual ao mockup. `SessionActions` (Reconectar/
 * Desconectar/Remover) passa a viver DENTRO do mesmo cartão do resumo da
 * sessão (o mockup não separa isso num bloco próprio).
 *
 * Correção 2026-08-07 (2ª rodada, pedido do fundador): o badge com o ícone
 * de celular vira a foto de perfil real do WhatsApp conectado
 * (`ContactAvatar`, mesmo mecanismo usado no `SessionRail`) quando
 * `session.phoneNumber` já é conhecido; sem ele, mantém o ícone de sempre.
 */
export default function SessionConnectionPanel({
  sessionName,
}: SessionConnectionPanelProps): JSX.Element {
  const router = useRouter();
  const { session, loading, errorMessage, connected } = useSessionDetail(sessionName);

  return (
    <div>
      {!connected && <p className="mb-3 text-sm text-warning">Reconectando ao servidor…</p>}

      {loading ? (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[1.3fr_1fr]">
          <Skeleton className="h-56 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg md:col-span-2" />
        </div>
      ) : !session ? (
        <ErrorState
          title="Não foi possível carregar esta sessão"
          description={errorMessage ?? 'Verifique se o nome está correto e tente novamente.'}
          onRetry={() => router.reload()}
        />
      ) : (
        <>
          {errorMessage && <p className="mb-3 text-sm text-destructive">{errorMessage}</p>}

          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[1.3fr_1fr]">
            <div className="rounded-lg border border-border bg-card p-[18px]">
              <div className="mb-4 flex items-center gap-3">
                {session.phoneNumber ? (
                  <ContactAvatar
                    sessionName={session.sessionName}
                    contactJid={`${session.phoneNumber}@s.whatsapp.net`}
                    className="h-11 w-11 text-sm"
                  />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Smartphone className="h-[21px] w-[21px]" aria-hidden="true" />
                  </span>
                )}
                <div>
                  <p className="text-[15px] font-semibold text-foreground">{session.sessionName}</p>
                  <div className="mt-0.5 flex items-center gap-[5px]">
                    <StatusDot status={session.status} />
                    <span className="text-xs text-muted-foreground">
                      {formatStatusLabel(session.status)}
                      {session.phoneNumber ? ` · ${session.phoneNumber}` : ''}
                    </span>
                  </div>
                </div>
              </div>

              <dl className="mb-[18px] grid grid-cols-2 gap-x-2.5 gap-y-2.5 text-[12.5px]">
                <div>
                  <dt className="mb-0.5 text-muted-foreground">Conectado desde</dt>
                  <dd className="font-medium text-foreground">
                    {formatDateTime(session.connectedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="mb-0.5 text-muted-foreground">Última atividade</dt>
                  <dd className="font-medium text-foreground">
                    {formatDateTime(session.lastSeen)}
                  </dd>
                </div>
                <div>
                  <dt className="mb-0.5 text-muted-foreground">Geração da instância</dt>
                  <dd className="font-medium text-foreground">#{session.generation}</dd>
                </div>
                <div>
                  <dt className="mb-0.5 text-muted-foreground">Criada em</dt>
                  <dd className="font-medium text-foreground">
                    {formatDateTime(session.createdAt)}
                  </dd>
                </div>
              </dl>

              <SessionActions sessionName={session.sessionName} status={session.status} />
            </div>

            <QRCodeCard sessionName={session.sessionName} status={session.status} />

            <div className="rounded-lg border border-border bg-card p-[18px] md:col-span-2">
              <h2 className="mb-2.5 text-[13.5px] font-semibold text-foreground">
                Histórico recente
              </h2>
              <HistoryList sessionName={session.sessionName} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
