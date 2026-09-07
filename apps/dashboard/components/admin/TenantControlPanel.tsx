import { useState } from 'react';

import ConfirmDialog from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import {
  PlatformApiError,
  changePlatformTenantPlan,
  reactivatePlatformTenant,
  suspendPlatformTenant,
  type PlatformTenantControlResult,
  type TenantPlan,
} from '@/lib/platformClientApi';

const PLAN_LABEL: Record<TenantPlan, string> = {
  free: 'Grátis',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const PLANS: TenantPlan[] = ['free', 'pro', 'enterprise'];

interface Props {
  tenant: { id: string; name: string; plan: TenantPlan; status: 'active' | 'suspended' };
  /** Atualiza a tela com o tenant já no estado novo. */
  onChanged: (result: PlatformTenantControlResult) => void;
}

type PendingAction =
  | { kind: 'plan'; plan: TenantPlan }
  | { kind: 'suspend' }
  | { kind: 'reactivate' }
  | null;

/**
 * Controle do tenant — Fase 4 (`ADMIN_PLATFORM_MASTER_PLAN.md` §8/§12).
 *
 * Fricção proporcional ao estrago: trocar plano e reativar pedem uma
 * confirmação simples; suspender pede uma confirmação FORTE — o diálogo
 * nomeia a consequência ("todos os usuários param de conseguir entrar") e o
 * botão carrega o rótulo da ação, nunca um "OK" genérico.
 *
 * A auditoria acontece no servidor, ANTES da escrita — aqui só o clique e o
 * feedback. Um no-op (plano igual, já suspenso) volta 409 e vira um toast
 * informativo, não um erro assustador.
 */
export default function TenantControlPanel({ tenant, onChanged }: Props): JSX.Element {
  const { toast } = useToast();
  const [pending, setPending] = useState<PendingAction>(null);

  async function run(
    action: () => Promise<PlatformTenantControlResult>,
    successMessage: string,
  ): Promise<void> {
    try {
      const result = await action();
      onChanged(result);
      toast({ title: successMessage });
    } catch (err) {
      if (err instanceof PlatformApiError && err.status === 409) {
        toast({ title: 'Nada a fazer', description: 'O tenant já está nesse estado.' });
        return;
      }
      toast({
        title: 'Não foi possível concluir',
        description: err instanceof Error ? err.message : 'Erro inesperado.',
        variant: 'destructive',
      });
    }
  }

  return (
    <section>
      <h2 className="text-sm font-medium">Controle</h2>
      <Card className="mt-2 space-y-4 p-4">
        <div>
          <p className="text-xs text-muted-foreground">Plano</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {PLANS.map((plan) => (
              <Button
                key={plan}
                type="button"
                size="sm"
                variant={plan === tenant.plan ? 'default' : 'outline'}
                disabled={plan === tenant.plan}
                onClick={() => setPending({ kind: 'plan', plan })}
              >
                {PLAN_LABEL[plan]}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Acesso</p>
          <div className="mt-1.5">
            {tenant.status === 'active' ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => setPending({ kind: 'suspend' })}
              >
                Suspender acesso
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPending({ kind: 'reactivate' })}
              >
                Reativar acesso
              </Button>
            )}
            {tenant.status === 'suspended' ? (
              <p className="mt-1.5 text-xs text-destructive">
                Suspenso — nenhum usuário desta empresa consegue entrar.
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={pending?.kind === 'plan'}
        onOpenChange={(open) => !open && setPending(null)}
        variant="default"
        title={
          pending?.kind === 'plan'
            ? `Mudar o plano de ${tenant.name} para ${PLAN_LABEL[pending.plan]}?`
            : ''
        }
        description="Muda o que o cliente pode fazer (não o acesso). Reversível a qualquer momento. A ação fica registrada na trilha da plataforma."
        confirmLabel="Mudar plano"
        pendingLabel="Mudando…"
        onConfirm={() => {
          if (pending?.kind !== 'plan') return;
          const { plan } = pending;
          return run(
            () => changePlatformTenantPlan(tenant.id, plan),
            `Plano alterado para ${PLAN_LABEL[plan]}.`,
          );
        }}
      />

      <ConfirmDialog
        open={pending?.kind === 'suspend'}
        onOpenChange={(open) => !open && setPending(null)}
        variant="destructive"
        title={`Suspender o acesso de ${tenant.name}?`}
        description="Todos os usuários desta empresa param de conseguir entrar imediatamente, e as sessões ativas caem no próximo refresh. O WhatsApp e os dados continuam intactos. Reversível pelo botão Reativar. A ação fica registrada na trilha da plataforma."
        confirmLabel="Suspender acesso"
        pendingLabel="Suspendendo…"
        onConfirm={() =>
          run(() => suspendPlatformTenant(tenant.id), `${tenant.name} foi suspenso.`)
        }
      />

      <ConfirmDialog
        open={pending?.kind === 'reactivate'}
        onOpenChange={(open) => !open && setPending(null)}
        variant="default"
        title={`Reativar o acesso de ${tenant.name}?`}
        description="Os usuários desta empresa voltam a conseguir entrar. A ação fica registrada na trilha da plataforma."
        confirmLabel="Reativar acesso"
        pendingLabel="Reativando…"
        onConfirm={() =>
          run(() => reactivatePlatformTenant(tenant.id), `${tenant.name} foi reativado.`)
        }
      />
    </section>
  );
}
