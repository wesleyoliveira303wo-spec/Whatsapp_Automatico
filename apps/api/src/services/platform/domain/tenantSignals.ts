import { TenantPlan } from '../../../shared/tenant/domain/TenantPlan';
import { TenantOverview } from './entities/TenantOverview';

/**
 * Sinais de atenção do Centro de Tenants — Fase 2
 * (`ADMIN_PLATFORM_MASTER_PLAN.md` §6.3).
 *
 * FUNÇÕES PURAS sobre o `TenantOverview` já buscado — nenhuma consulta aqui.
 * Os limiares são constantes EXPLÍCITAS: ponto de partida declarado,
 * calibrável com uso real, mesmo caminho do rate limit de IA (Bloco F1.10).
 *
 * REGRA DE APRESENTAÇÃO (§5.3, inegociável): um sinal NUNCA é só cor. Cada um
 * carrega `severity` (para ordenar/pintar) E `label` legível ("Desconectado",
 * "Sumiu"). Quem renderiza mostra ícone + texto — cor sozinha não é
 * informação para quem não a distingue.
 *
 * LIÇÃO DE PROCESSO (§6.3.1): os limiares abaixo foram conferidos contra a
 * base real em 2026-09-06 antes de virarem código — 21 tenants, 20 sem
 * nenhuma sessão ("Nunca começou"), tenant-1 com 53/213 = 24,9% de
 * `PROVIDER_ERROR` (dispara "IA falhando", como esperado) e escalonamento de
 * ~3% (não dispara "IA travando"). Regra escrita parece certa até encontrar
 * os dados; estes já encontraram.
 */

/** Chave estável do sinal — nunca traduzida, usada por teste e por `key` de lista. */
export type TenantSignalKey =
  | 'disconnected'
  | 'vanished'
  | 'never_started'
  | 'ai_stuck'
  | 'ai_failing'
  | 'high_cost'
  | 'healthy';

export type TenantSignalSeverity = 'red' | 'amber' | 'green';

export interface TenantSignal {
  key: TenantSignalKey;
  severity: TenantSignalSeverity;
  /** Rótulo curto em português — SEMPRE exibido junto da cor. */
  label: string;
  /** Uma frase: o que este sinal quer dizer para o fundador. */
  reading: string;
}

// --- Limiares (§6.3). Alterar aqui recalibra o painel inteiro. ---

/** "Sumiu": última atividade registrada há mais que isto. */
export const VANISHED_AFTER_DAYS = 7;

/**
 * "Nunca começou": sessão conectada mas com menos mensagens que isto —
 * não passou da instalação. (Sem sessão nenhuma também conta, ver função.)
 */
export const NEVER_STARTED_MAX_MESSAGES = 20;

/** "IA travando": fração de conversas escaladas acima disto no período. */
export const AI_STUCK_ESCALATION_RATE = 0.3;

/** "IA falhando": fração de interações com `PROVIDER_ERROR` acima disto. */
export const AI_FAILING_ERROR_RATE = 0.2;

/** "Custo alto": custo de IA no período acima desta fração do preço do plano. */
export const HIGH_COST_PLAN_FRACTION = 0.2;

/**
 * Preço mensal do plano em USD — DERIVADO das cifras em `CONTEXT.md`
 * (R$ 0 / R$ 99 / R$ 349) a uma taxa de referência FIXA de R$ 5,50/US$.
 *
 * NÃO é cotação ao vivo e NÃO vive no banco (`Tenant` só tem o enum `plan` —
 * lacuna que o próprio plano mestre registra, §10.2). É uma constante
 * provisória, no mesmo espírito dos demais limiares: existe para o sinal
 * "Custo alto" ter contra o que comparar até o preço do plano ganhar um lugar
 * no schema (candidato à Fase 4, junto da migration `Tenant.status`).
 *
 * Consequência hoje: no free tier do Gemini o custo real é US$ 0, então este
 * sinal nunca dispara — ele passa a valer quando um provider pago estiver
 * ativo.
 */
export const PLAN_MONTHLY_PRICE_USD: Record<TenantPlan, number> = {
  free: 0,
  pro: 18,
  enterprise: 63,
};

// --- Predicados individuais (um por linha do §6.3) ---

/** Tinha conexão e caiu: existe sessão REGISTRADA e nenhuma `connected`. */
export function isDisconnected(t: TenantOverview): boolean {
  return t.sessionCount > 0 && t.connectedSessionCount === 0;
}

/**
 * Usou e abandonou: TEM atividade registrada e a última foi há mais de
 * `VANISHED_AFTER_DAYS`. A guarda de "tem atividade" é o que separa isto de
 * "nunca apareceu" (§6.3.1).
 */
export function hasVanished(t: TenantOverview, now: Date): boolean {
  if (!t.lastActivityAt) return false;
  const elapsedMs = now.getTime() - t.lastActivityAt.getTime();
  return elapsedMs > VANISHED_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Não passou da instalação: NENHUMA sessão registrada, OU tem sessão
 * conectada mas com menos de `NEVER_STARTED_MAX_MESSAGES` mensagens no
 * período.
 */
export function hasNeverStarted(t: TenantOverview): boolean {
  if (t.sessionCount === 0) return true;
  const totalMessages = t.messages30d.inbound + t.messages30d.outbound;
  return t.connectedSessionCount > 0 && totalMessages < NEVER_STARTED_MAX_MESSAGES;
}

/** A IA não dá conta (ou o Cérebro está vazio): escalonamento acima do limiar. */
export function isAiStuck(t: TenantOverview): boolean {
  if (t.conversations30d.total === 0) return false;
  return t.conversations30d.escalated / t.conversations30d.total > AI_STUCK_ESCALATION_RATE;
}

/** Cota estourada ou provider instável: `PROVIDER_ERROR` acima do limiar. */
export function isAiFailing(t: TenantOverview): boolean {
  if (t.ai30d.total === 0) return false;
  return t.ai30d.providerError / t.ai30d.total > AI_FAILING_ERROR_RATE;
}

/** Come a margem do plano: custo de IA acima da fração do preço do plano. */
export function hasHighCost(t: TenantOverview): boolean {
  const planPrice = PLAN_MONTHLY_PRICE_USD[t.plan];
  if (planPrice <= 0) return false;
  const costUsd = Number.parseFloat(t.ai30d.costUsd);
  if (!Number.isFinite(costUsd)) return false;
  return costUsd > planPrice * HIGH_COST_PLAN_FRACTION;
}

const SIGNAL_LABEL: Record<TenantSignalKey, string> = {
  disconnected: 'Desconectado',
  vanished: 'Sumiu',
  never_started: 'Nunca começou',
  ai_stuck: 'IA travando',
  ai_failing: 'IA falhando',
  high_cost: 'Custo alto',
  healthy: 'Saudável',
};

const SIGNAL_READING: Record<TenantSignalKey, string> = {
  disconnected: 'Tinha conexão e caiu — está sem funcionar e talvez nem saiba.',
  vanished: 'Usou o produto e abandonou.',
  never_started: 'Não passou da instalação — precisa de ajuda para começar.',
  ai_stuck: 'A IA não está dando conta sozinha, ou o Cérebro da IA está vazio.',
  ai_failing: 'A IA está falhando — cota estourada ou provider instável.',
  high_cost: 'O custo de IA está comendo a margem deste plano.',
  healthy: 'Nenhum sinal de atenção.',
};

function signal(key: TenantSignalKey, severity: TenantSignalSeverity): TenantSignal {
  return { key, severity, label: SIGNAL_LABEL[key], reading: SIGNAL_READING[key] };
}

/**
 * Todos os sinais que se aplicam ao tenant, DA MAIS GRAVE PARA A MENOS.
 *
 * Precedência (§6.3): vermelho antes de âmbar; entre vermelhos,
 * `Desconectado` antes de `Sumiu` (quem está desconectado provavelmente sumiu
 * POR CAUSA disso). Nada se aplica → um único `Saudável` 🟢.
 *
 * Devolve a LISTA inteira (não só o pior): a tabela mostra até 2-3 selos, e a
 * leitura de "IA falhando + Custo alto" juntos vale mais que só o topo.
 */
export function evaluateTenantSignals(t: TenantOverview, now: Date = new Date()): TenantSignal[] {
  const reds: TenantSignal[] = [];
  const ambers: TenantSignal[] = [];

  // Ordem de push entre vermelhos = ordem de precedência pedida.
  if (isDisconnected(t)) reds.push(signal('disconnected', 'red'));
  if (hasVanished(t, now)) reds.push(signal('vanished', 'red'));

  if (hasNeverStarted(t)) ambers.push(signal('never_started', 'amber'));
  if (isAiStuck(t)) ambers.push(signal('ai_stuck', 'amber'));
  if (isAiFailing(t)) ambers.push(signal('ai_failing', 'amber'));
  if (hasHighCost(t)) ambers.push(signal('high_cost', 'amber'));

  const all = [...reds, ...ambers];
  return all.length > 0 ? all : [signal('healthy', 'green')];
}

/** O sinal mais grave — para ordenar a lista de tenants por urgência. */
export function worstSignal(signals: TenantSignal[]): TenantSignal {
  return signals[0];
}
