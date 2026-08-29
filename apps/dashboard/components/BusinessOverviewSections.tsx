import Link from 'next/link';
import { Clock, Sparkles, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/states/EmptyState';
import { useAllBusinessProfiles, type SessionBusinessProfile } from '@/hooks/useAllBusinessProfiles';

/** Nome completo do dia (bit0=Dom…bit6=Sáb) — mesmo esquema de `AiProfilePanel.DAYS`, mas por extenso (o Perfil é LEITURA, o print de referência mostra o nome completo, não a abreviação da tela de edição). */
const WEEKDAY_LABELS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const;

function activeWeekdayLabels(workingDays: number): string[] {
  return WEEKDAY_LABELS.filter((_, bit) => (workingDays & (1 << bit)) !== 0);
}

function SessionCardShell({
  sessionName,
  icon: Icon,
  children,
}: {
  sessionName: string;
  icon: typeof Clock;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-[15px] w-[15px]" aria-hidden="true" />
          </span>
          <span className="truncate text-[13.5px] font-semibold text-foreground">
            {sessionName}
          </span>
        </div>
        <Link
          href={`/sessions/${encodeURIComponent(sessionName)}/ai`}
          className="group flex shrink-0 items-center gap-1 text-[11.5px] text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Configurado no Cérebro da IA"
          aria-label={`Cérebro da IA de ${sessionName}`}
        >
          Cérebro da IA
          <ArrowRight
            className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      </div>
      {children}
    </Card>
  );
}

function LoadingCards(): JSX.Element {
  return (
    <div className="flex flex-col gap-2.5">
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
    </div>
  );
}

/**
 * "Horário de atendimento" (Auditoria do Perfil, 2026-08-28, Fase 8) —
 * SOMENTE LEITURA de propósito (regra explícita do fundador): o horário
 * continua sendo editado só no Cérebro da IA (evita duas telas salvando o
 * mesmo campo, mesmo racional já usado em `AtendimentoSettingsTab`). Uma
 * seção por SESSÃO — não existe "o horário da empresa" único quando há mais
 * de um WhatsApp (cada um tem o próprio `AiBusinessProfile`).
 */
export function WorkingHoursSection({
  items,
  loading,
  errorMessage,
}: {
  items: SessionBusinessProfile[];
  loading: boolean;
  errorMessage: string | null;
}): JSX.Element {
  if (loading) return <LoadingCards />;
  if (errorMessage) {
    return (
      <p role="alert" aria-live="polite" className="text-sm text-destructive">
        {errorMessage}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="Nenhum WhatsApp conectado"
        description="O horário de atendimento é definido por WhatsApp. Conecte um número para configurar quando o Francis atende."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {items.map(({ sessionName, profile }) => {
        const configured =
          profile?.offHoursEnabled && profile.workingHoursStart && profile.workingHoursEnd;
        return (
          <SessionCardShell key={sessionName} sessionName={sessionName} icon={Clock}>
            {configured ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
                {activeWeekdayLabels(profile!.workingDays).map((day) => (
                  <div key={day} className="contents">
                    <dt className="text-muted-foreground">{day}</dt>
                    <dd className="text-foreground">
                      {profile!.workingHoursStart} – {profile!.workingHoursEnd}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-[12.5px] text-muted-foreground">
                Sem horário configurado — atende a qualquer hora.
              </p>
            )}
          </SessionCardShell>
        );
      })}
    </div>
  );
}

/**
 * "Sobre o negócio" (Auditoria do Perfil, 2026-08-28, Fase 15) — resumo
 * CACHEADO (pedido explícito do fundador: "automático e deve ficar salvo,
 * atualizar somente quando houver interação no cérebro da IA"). Este
 * componente só EXIBE `profile.summary` — nunca chama a IA, nunca gera
 * nada; a geração acontece no backend, disparada por `PUT .../ai-profile`
 * (ver `BusinessSummaryService`).
 */
export function BusinessSummarySection({
  items,
  loading,
  errorMessage,
}: {
  items: SessionBusinessProfile[];
  loading: boolean;
  errorMessage: string | null;
}): JSX.Element {
  if (loading) return <LoadingCards />;
  if (errorMessage) {
    return (
      <p role="alert" aria-live="polite" className="text-sm text-destructive">
        {errorMessage}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Nenhum WhatsApp conectado"
        description="Conecte um número e configure o Cérebro da IA para ver um resumo do seu negócio aqui."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {items.map(({ sessionName, profile }) => (
        <SessionCardShell key={sessionName} sessionName={sessionName} icon={Sparkles}>
          {profile?.summary ? (
            <p className="text-[12.5px] leading-relaxed text-foreground">{profile.summary}</p>
          ) : profile && profile.content.trim() !== '' ? (
            // Cérebro preenchido mas resumo ainda nulo = geração em andamento
            // no backend (fire-and-forget após salvar, ~15-25s com a IA).
            // `useAllBusinessProfiles` fica repetindo a busca até aparecer.
            <p className="text-[12.5px] text-muted-foreground">Gerando resumo…</p>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">
              Ainda sem resumo — descreva o negócio no Cérebro da IA desta sessão para gerar um.
            </p>
          )}
        </SessionCardShell>
      ))}
    </div>
  );
}

export { useAllBusinessProfiles };
