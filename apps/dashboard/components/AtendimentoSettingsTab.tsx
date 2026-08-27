import Link from 'next/link';
import { Clock, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/states/EmptyState';
import { useSessionsList } from '@/hooks/useSessionsList';

/**
 * Seção "Atendimento" de Configurações — Reestruturação, Fase 3
 * (2026-08-27, ver `CONFIGURACOES_REDESIGN_PLAN.md` §P3).
 *
 * A auditoria encontrou o horário de atendimento (dias, faixa de horário,
 * fuso, mensagem de ausência) escondido em *Cérebro da IA → Visão geral* —
 * porque a tabela que o guarda se chama `AiBusinessProfile`. É nome de
 * tabela vazando para a UX: horário é regra de ATENDIMENTO, não de IA, e
 * ninguém procuraria por ele ali.
 *
 * Esta seção corrige a DESCOBERTA sem duplicar a implementação: o horário
 * continua morando (e sendo editado) no formulário único do Cérebro da IA —
 * duplicar o form aqui criaria dois lugares para salvar o mesmo campo, que
 * é pior que o problema original. Aqui a pessoa ENCONTRA o que procura e é
 * levada direto ao lugar certo.
 *
 * Por que não movemos o campo de vez nesta rodada: o horário é **por
 * sessão** (`AiBusinessProfile.sessionName`), e Configurações é nível
 * TENANT. Mover exige antes decidir se passa a existir um horário padrão do
 * tenant (com a sessão sobrescrevendo) — decisão de produto + migration,
 * registrada como Fase 4 no plano. Prometer aqui um "horário da empresa"
 * que o backend não tem seria inventar função.
 */
export default function AtendimentoSettingsTab(): JSX.Element {
  const { sessions, loading, errorMessage } = useSessionsList();

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  if (errorMessage) {
    return (
      <p role="alert" aria-live="polite" className="text-sm text-destructive">
        {errorMessage}
      </p>
    );
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="Nenhum WhatsApp conectado"
        description="O horário de atendimento é definido por WhatsApp. Conecte um número para configurar quando o Francis atende."
      />
    );
  }

  return (
    <div>
      {/* Sem parágrafo de intro aqui: essa frase virou a descrição da
          seção no `SettingsLayout` — a mesma correção de mensagem
          duplicada aplicada em WhatsApps e Segurança (2026-08-27). */}
      <div className="flex flex-col gap-2.5">
        {sessions.map((session) => (
          <Link
            key={session.id}
            href={`/sessions/${encodeURIComponent(session.sessionName)}/ai`}
            className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="flex items-center gap-3 p-4 transition-colors hover:border-primary">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Clock className="h-[17px] w-[17px]" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-foreground">
                  {session.sessionName}
                </span>
                <span className="block truncate text-[12.5px] text-muted-foreground">
                  Definir dias, horário, fuso e mensagem de ausência
                </span>
              </span>
              <ArrowRight
                className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                aria-hidden="true"
              />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
