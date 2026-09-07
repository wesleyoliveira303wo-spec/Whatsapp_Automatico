import { TenantOverview } from './entities/TenantOverview';
import { TenantSignal, evaluateTenantSignals } from './tenantSignals';

/**
 * Um item da Fila de ação do Início — Fase 3
 * (`ADMIN_PLATFORM_MASTER_PLAN.md` §5.1).
 *
 * FUNÇÃO PURA: recebe o que já foi buscado (a lista de tenants com seus
 * sinais + a contagem de campanhas pausadas pelo disjuntor) e devolve a
 * lista de "o que precisa de você agora", ordenada por urgência.
 *
 * "Vazia é sucesso": lista vazia significa que nada precisa de atenção.
 */
export interface ActionQueueItem {
  key: 'sessions_down' | 'tenants_at_risk' | 'campaigns_breaker' | 'never_started';
  severity: 'red' | 'amber';
  /** Quantos tenants/campanhas caem neste item. Sempre > 0 (itens zerados são omitidos). */
  count: number;
  /** Texto pronto: "3 clientes com WhatsApp fora do ar". */
  label: string;
  /** Para onde o clique leva. */
  href: string;
}

export interface ActionQueueInput {
  tenants: Array<{ tenant: TenantOverview; signals: TenantSignal[] }>;
  /** `campaigns.status = PAUSED` com `paused_reason` — pausadas pelo disjuntor de segurança. */
  campaignsPausedByBreaker: number;
}

/**
 * NOTA: "Pedidos de suporte aguardando resposta" (§5.1, primeira linha) NÃO
 * entra aqui — depende de `TenantAccessRequest`, que só nasce na Fase 5.
 * Quando existir, é só somar mais um item no topo.
 */
export function buildActionQueue(input: ActionQueueInput): ActionQueueItem[] {
  const items: ActionQueueItem[] = [];

  const has = (row: (typeof input.tenants)[number], key: TenantSignal['key']): boolean =>
    row.signals.some((s) => s.key === key);

  // 1. WhatsApp caiu: tinha conexão e não tem mais. O cliente pode nem saber.
  const down = input.tenants.filter((r) => has(r, 'disconnected'));
  if (down.length > 0) {
    items.push({
      key: 'sessions_down',
      severity: 'red',
      count: down.length,
      label: pluralize(
        down.length,
        'cliente com WhatsApp fora do ar',
        'clientes com WhatsApp fora do ar',
      ),
      href: '/admin/tenants',
    });
  }

  // 2. Tenant em atenção por OUTRO motivo vermelho (hoje: "Sumiu").
  const atRisk = input.tenants.filter(
    (r) => r.signals.some((s) => s.severity === 'red') && !has(r, 'disconnected'),
  );
  if (atRisk.length > 0) {
    items.push({
      key: 'tenants_at_risk',
      severity: 'red',
      count: atRisk.length,
      label: pluralize(atRisk.length, 'cliente em atenção', 'clientes em atenção'),
      href: '/admin/tenants',
    });
  }

  // 3. Campanha parada pelo disjuntor — algo se protegeu sozinho, dá uma olhada.
  if (input.campaignsPausedByBreaker > 0) {
    items.push({
      key: 'campaigns_breaker',
      severity: 'amber',
      count: input.campaignsPausedByBreaker,
      label: pluralize(
        input.campaignsPausedByBreaker,
        'campanha pausada pelo disjuntor',
        'campanhas pausadas pelo disjuntor',
      ),
      href: '/admin/tenants',
    });
  }

  // 4. Nunca começou — acompanhamento COMERCIAL, não incidente técnico (§5.1).
  const neverStarted = input.tenants.filter((r) => has(r, 'never_started'));
  if (neverStarted.length > 0) {
    items.push({
      key: 'never_started',
      severity: 'amber',
      count: neverStarted.length,
      label: pluralize(
        neverStarted.length,
        'cliente que não passou da instalação',
        'clientes que não passaram da instalação',
      ),
      href: '/admin/tenants',
    });
  }

  return items;
}

/** Reavalia os sinais de uma lista de overviews — atalho para chamadores que só têm o overview. */
export function withSignals(
  overviews: TenantOverview[],
  now: Date = new Date(),
): ActionQueueInput['tenants'] {
  return overviews.map((tenant) => ({ tenant, signals: evaluateTenantSignals(tenant, now) }));
}

function pluralize(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
