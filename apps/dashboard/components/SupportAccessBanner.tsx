import { useState } from 'react';
import { useRouter } from 'next/router';
import { ShieldAlert, ShieldQuestion } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useSupportAccess } from '@/hooks/useSupportAccess';

/**
 * Aviso de ACESSO ASSISTIDO no topo do produto — Painel `/admin`, Fase 5
 * (`ADMIN_PLATFORM_MASTER_PLAN.md` §9.1).
 *
 * Montado uma vez em `_app.tsx` — é o único ponto que cobre TODAS as telas do
 * produto. Não aparece no próprio `/admin`, nem nas telas de pré-login.
 *
 * - `pending` → faixa âmbar: quem pediu, o motivo, o que permite, e os botões
 *   **Autorizar** / **Recusar** (habilitados só para dono/administrador).
 * - `accepted` → faixa vermelha **FIXA, SEM fechar** (Regra inviolável 4):
 *   "O suporte está acessando sua conta agora", desde quando, e o botão
 *   **Encerrar** (revoga na hora, sem passar pelo fundador — Regra 2).
 */
export default function SupportAccessBanner(): JSX.Element | null {
  const router = useRouter();
  const path = router.pathname;
  const isProductScreen =
    !path.startsWith('/admin') &&
    !['/login', '/register', '/change-password', '/termos', '/404', '/500', '/_error'].includes(
      path,
    );

  const { open, canRespond, loading, unauthenticated, respond, revoke } =
    useSupportAccess(isProductScreen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isProductScreen || unauthenticated || loading || !open) {
    return null;
  }

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError('Não foi possível concluir. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  if (open.status === 'pending') {
    return (
      <div className="w-full border-b border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <ShieldQuestion className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <p className="font-medium">
                {open.adminName} pediu acesso à sua conta para dar suporte.
              </p>
              <p className="text-muted-foreground">
                Motivo: “{open.reason}”. Se você autorizar, o suporte poderá ver e operar sua
                conta por 2 horas. Você pode encerrar a qualquer momento.
              </p>
              {error ? <p className="mt-1 text-destructive">{error}</p> : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canRespond ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(() => respond('deny'))}
                >
                  Recusar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => void run(() => respond('accept'))}
                >
                  Autorizar acesso
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Só o dono ou um administrador pode responder.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (open.status === 'accepted') {
    const since = new Date(open.respondedAt ?? open.requestedAt).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return (
      <div
        className="w-full border-b border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-foreground"
        role="status"
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <ShieldAlert
              className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">
                O suporte da plataforma está acessando sua conta agora.
              </p>
              <p className="text-muted-foreground">
                {open.adminName}, desde as {since}. Encerra sozinho em até 2 horas.
              </p>
              {error ? <p className="mt-1 text-destructive">{error}</p> : null}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => void run(revoke)}
            className="shrink-0"
          >
            Encerrar acesso
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
