import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/states/ErrorState';
import { useRefreshPlan } from '@/contexts/PlanContext';
import { commercialWhatsAppLink } from '@/lib/brand';
import {
  canOpenPortal,
  canStartCheckout,
  describeBillingSituation,
  isSubscriptionConfirmed,
  PLAN_SUMMARY,
  whatsAppAllowanceLabel,
} from '@/lib/billingView';
import {
  ClientApiError,
  fetchBillingStatus,
  openBillingPortal,
  startCheckout,
  type BillingStatus,
} from '@/lib/clientApi';
import { PAID_PLANS, PLAN_LABEL, PLAN_PRICE_LABEL, type PaidPlan } from '@/lib/plans';
import { cn } from '@/lib/utils';

interface PlanSettingsTabProps {
  /** Só o dono assina ou troca de plano (a API confere de novo). */
  canManage: boolean;
  /** Ritmo da espera depois de voltar do Stripe. Parâmetros para os testes. */
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  /** Para onde o navegador vai (a página do Stripe). Parâmetro para os testes. */
  navigate?: (url: string) => void;
}

/** O que aconteceu na volta do Stripe (`?checkout=`). */
type ReturnState = 'none' | 'waiting' | 'confirmed' | 'slow' | 'canceled';

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_POLL_TIMEOUT_MS = 60_000;

function goTo(url: string): void {
  window.location.assign(url);
}

function actionErrorMessage(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 401) return 'Sessão expirada — faça login novamente.';
    const body = error.body as { message?: unknown } | undefined;
    if (typeof body?.message === 'string' && body.message.trim()) return body.message;
  }
  return 'Não foi possível abrir a página de pagamento. Tente de novo.';
}

/**
 * Aba Plano de Configurações (B5, etapa 2): o plano atual, em que pé está a
 * assinatura, os três planos pagos e o caminho para assinar (checkout do
 * Stripe) ou gerenciar (portal do Stripe).
 *
 * A página de pagamento e o portal são do Stripe — aqui nunca passa número de
 * cartão. O plano só muda quando o aviso assinado do Stripe chega à API; por
 * isso, na volta do pagamento, a tela ESPERA esse aviso em vez de supor que
 * deu certo.
 */
export default function PlanSettingsTab({
  canManage,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  pollTimeoutMs = DEFAULT_POLL_TIMEOUT_MS,
  navigate = goTo,
}: PlanSettingsTabProps): JSX.Element {
  const router = useRouter();
  const refreshPlan = useRefreshPlan();

  // Lido uma vez na montagem: limpar a URL depois não pode reiniciar a espera.
  const [checkoutParam] = useState(() => router.query.checkout);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [returnState, setReturnState] = useState<ReturnState>(() =>
    checkoutParam === 'done' ? 'waiting' : checkoutParam === 'canceled' ? 'canceled' : 'none',
  );
  const [busy, setBusy] = useState<PaidPlan | 'portal' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // O roteador de teste é um objeto novo a cada render; a ref evita refazer os efeitos.
  const routerRef = useRef(router);
  routerRef.current = router;
  const refreshPlanRef = useRef(refreshPlan);
  refreshPlanRef.current = refreshPlan;

  /** Tira o `?checkout=` da URL: um F5 depois não repete o aviso. */
  const clearCheckoutParam = useCallback(() => {
    const path = routerRef.current.asPath.split('?')[0];
    void routerRef.current.replace(path, undefined, { shallow: true });
  }, []);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const { billing: next } = await fetchBillingStatus();
      setBilling(next);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  // Carga normal. Na volta de um pagamento, quem carrega é a espera abaixo.
  useEffect(() => {
    if (checkoutParam === 'done') return;
    void load();
    if (checkoutParam === 'canceled') clearCheckoutParam();
  }, [checkoutParam, load, clearCheckoutParam]);

  // Volta do Stripe com pagamento: consulta até o aviso confirmar, ou desiste no prazo.
  useEffect(() => {
    if (checkoutParam !== 'done') return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + pollTimeoutMs;

    const tick = async (): Promise<void> => {
      try {
        const { billing: next } = await fetchBillingStatus();
        if (cancelled) return;
        setBilling(next);
        setLoadFailed(false);
        if (isSubscriptionConfirmed(next)) {
          setReturnState('confirmed');
          refreshPlanRef.current();
          clearCheckoutParam();
          return;
        }
      } catch {
        // Falha de rede no meio da espera: tenta de novo no próximo tique.
      }
      if (cancelled) return;
      if (Date.now() >= deadline) {
        setReturnState('slow');
        return;
      }
      timer = setTimeout(() => void tick(), pollIntervalMs);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [checkoutParam, pollIntervalMs, pollTimeoutMs, clearCheckoutParam]);

  const run = async (
    target: PaidPlan | 'portal',
    action: () => Promise<{ url: string }>,
  ): Promise<void> => {
    setBusy(target);
    setActionError(null);
    try {
      const { url } = await action();
      navigate(url);
      // `busy` fica ligado: a página está indo embora.
    } catch (error) {
      setActionError(actionErrorMessage(error));
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <ReturnNotice state={returnState} />

      {billing === null && loadFailed && (
        <ErrorState
          title="Não foi possível carregar o plano"
          description="Tente de novo em alguns segundos."
          onRetry={() => void load()}
        />
      )}

      {billing === null && !loadFailed && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      )}

      {billing !== null && (
        <PlanContent
          billing={billing}
          canManage={canManage}
          busy={busy}
          actionError={actionError}
          onCheckout={(plan) => void run(plan, () => startCheckout(plan))}
          onPortal={() => void run('portal', openBillingPortal)}
        />
      )}
    </div>
  );
}

function ReturnNotice({ state }: { state: ReturnState }): JSX.Element | null {
  if (state === 'none') return null;

  const content: Record<Exclude<ReturnState, 'none'>, JSX.Element> = {
    waiting: (
      <>
        <Loader2 className="h-4 w-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
        Ativando seu plano…
      </>
    ),
    confirmed: (
      <>
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success-emphasis" aria-hidden="true" />
        Plano ativado.
      </>
    ),
    slow: <>A confirmação está demorando — atualize a página em alguns minutos.</>,
    canceled: <>Nada foi cobrado. Você pode assinar quando quiser.</>,
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-[13px] text-foreground"
    >
      {content[state]}
    </div>
  );
}

interface PlanContentProps {
  billing: BillingStatus;
  canManage: boolean;
  busy: PaidPlan | 'portal' | null;
  actionError: string | null;
  onCheckout: (plan: PaidPlan) => void;
  onPortal: () => void;
}

function PlanContent({
  billing,
  canManage,
  busy,
  actionError,
  onCheckout,
  onPortal,
}: PlanContentProps): JSX.Element {
  const situation = describeBillingSituation(billing);
  const showCheckout = canStartCheckout(billing, canManage);
  const showPortal = canOpenPortal(billing, canManage);
  const pastDue = billing.subscription?.status === 'past_due';
  const checkoutLabel = billing.trialAvailable ? 'Testar 1 dia grátis' : 'Assinar';

  return (
    <>
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[12px] text-muted-foreground">Plano atual</p>
          <p className="text-[20px] font-semibold tracking-tight text-foreground">
            {PLAN_LABEL[billing.plan]}
          </p>
          {situation && (
            <p
              className={cn(
                'mt-0.5 text-[13px]',
                pastDue ? 'text-warning-emphasis' : 'text-muted-foreground',
              )}
            >
              {situation}
            </p>
          )}
        </div>
        {showPortal && (
          <Button
            variant="outline"
            size="sm"
            className="w-full shrink-0 sm:w-auto"
            disabled={busy !== null}
            onClick={onPortal}
          >
            {busy === 'portal' ? 'Abrindo…' : 'Gerenciar assinatura'}
          </Button>
        )}
      </Card>

      {actionError && (
        <p role="alert" className="text-[13px] text-destructive">
          {actionError}
        </p>
      )}

      <ul className="grid gap-3 lg:grid-cols-3">
        {PAID_PLANS.map((plan) => {
          const current = billing.plan === plan;
          return (
            <li key={plan} className="min-w-0">
              <Card className={cn('flex h-full flex-col p-4', current && 'border-primary')}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[15px] font-semibold text-foreground">{PLAN_LABEL[plan]}</h3>
                  {current && <Badge variant="success">Seu plano</Badge>}
                </div>
                <p className="mt-2">
                  <span className="text-[22px] font-semibold tabular-nums text-foreground">
                    {PLAN_PRICE_LABEL[plan]}
                  </span>
                  <span className="text-[13px] text-muted-foreground">/mês</span>
                </p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  {whatsAppAllowanceLabel(plan)}
                </p>
                <p className="mt-2 flex-1 text-[13px] text-foreground">{PLAN_SUMMARY[plan]}</p>
                {showCheckout && (
                  <Button
                    className="mt-4 w-full"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => onCheckout(plan)}
                  >
                    {busy === plan ? 'Abrindo…' : checkoutLabel}
                  </Button>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      {!billing.billingEnabled && (
        <p className="text-[13px] text-muted-foreground">
          A assinatura pelo site ainda não está disponível. Para ativar agora, fale com o comercial.{' '}
          <a
            href={commercialWhatsAppLink('Quero assinar um plano do Francis.')}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Falar com o comercial
          </a>
        </p>
      )}

      {billing.billingEnabled && !canManage && (
        <p className="text-[13px] text-muted-foreground">
          Só o dono da conta assina ou troca de plano.
        </p>
      )}

      {showCheckout && billing.trialAvailable && (
        <p className="text-[12.5px] text-muted-foreground">
          O teste pede um cartão. Se você não cancelar, a cobrança mensal começa no dia seguinte.
        </p>
      )}
    </>
  );
}
