import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { CreditCard } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useMe } from '@/hooks/useMe';
import { usePollingRefresh } from '@/hooks/usePollingRefresh';
import { formatBillingDate, pastDueDeadline } from '@/lib/billingView';
import { fetchBillingStatus, openBillingPortal, type BillingStatus } from '@/lib/clientApi';

const POLL_INTERVAL_MS = 30_000;

const HIDDEN_PATHS = ['/login', '/register', '/change-password', '/termos', '/404', '/500', '/_error'];

/**
 * Aviso de pagamento em atraso — B5, etapa 3. Montado uma vez em `_app.tsx`
 * (mesma posição de `SupportAccessBanner`, abaixo dele — empilha em vez de
 * sobrepor no caso raríssimo de os dois estarem ativos ao mesmo tempo).
 *
 * Fixo no topo, SEM botão de fechar (é dinheiro, diferente de um banner
 * descartável): todos os logados do tenant veem o prazo; só o dono vê o
 * botão que abre o portal do Stripe.
 */
export default function PastDueBanner(): JSX.Element | null {
  const router = useRouter();
  const isProductScreen = !router.pathname.startsWith('/admin') && !HIDDEN_PATHS.includes(router.pathname);
  const { user } = useMe();
  const isOwner = user?.role === 'owner';

  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!isProductScreen) return;
    fetchBillingStatus()
      .then(({ billing }) => setBilling(billing))
      .catch(() => {
        // Falha de rede/sessão: mantém o último estado conhecido — o próximo
        // poll tenta de novo. Nunca esconde um aviso já mostrado por causa
        // disso, nem trava a tela por uma falha auxiliar.
      });
  }, [isProductScreen]);

  useEffect(() => {
    refresh();
  }, [refresh]);
  usePollingRefresh(refresh, POLL_INTERVAL_MS);

  if (!isProductScreen || !billing) {
    return null;
  }

  const deadline = pastDueDeadline(billing);
  if (!deadline) {
    return null;
  }

  const now = new Date();
  const deadlineLabel =
    deadline.getTime() > now.getTime()
      ? formatBillingDate(deadline.toISOString())
      : 'a qualquer momento';

  return (
    <div
      className="w-full border-b border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-foreground"
      role="status"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <p>
            <span className="font-medium">Pagamento em atraso.</span> Em {deadlineLabel} a
            assinatura será cancelada e o plano volta para o Grátis.
          </p>
        </div>
        {isOwner ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            className="shrink-0"
            onClick={() => {
              setBusy(true);
              openBillingPortal()
                .then(({ url }) => window.location.assign(url))
                .catch(() => setBusy(false));
            }}
          >
            Atualizar pagamento
          </Button>
        ) : null}
      </div>
    </div>
  );
}
