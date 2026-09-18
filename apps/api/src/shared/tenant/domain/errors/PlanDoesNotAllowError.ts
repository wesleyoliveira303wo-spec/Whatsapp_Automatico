import { PlanCapability } from '../planCapabilities';

const MESSAGES: Record<PlanCapability, string> = {
  operation: 'Este recurso faz parte dos planos pagos (Disparos, Pro ou Enterprise).',
  ai: 'Os recursos de IA fazem parte dos planos Pro e Enterprise.',
};

/**
 * O plano do tenant não libera o recurso pedido (B5, 2026-09-18). Os error
 * handlers traduzem para 403 `plan_does_not_allow` — mesmo espírito dos erros
 * de plano já existentes (`CampaignRequiresPaidPlanError` e irmãos).
 */
export class PlanDoesNotAllowError extends Error {
  constructor(readonly capability: PlanCapability) {
    super(MESSAGES[capability]);
    this.name = 'PlanDoesNotAllowError';
  }
}
