import { Logger } from '../../../shared/domain/Logger';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { AiBusinessProfile } from '../domain/entities/AiBusinessProfile';
import { AiBusinessProfileRepository } from '../domain/repositories/AiBusinessProfileRepository';

/**
 * Teto de tamanho do texto do perfil (Base de Conhecimento, Nível 1). NÃO é um
 * limite de banco (`content` é `@db.Text`, praticamente ilimitado) — é um
 * limite de PRODUTO/custo: o perfil inteiro é anexado ao prompt de sistema a
 * CADA resposta gerada, então cada caractere aqui vira tokens gastos por
 * mensagem. 20.000 caracteres (~5.000 tokens) é generoso para um catálogo de
 * PME e ainda mantém o custo por resposta previsível. Validado na Presentation
 * (zod), com a constante exportada para o router referenciar — a regra de
 * "quão grande" mora aqui, no Application, não espalhada no router.
 */
export const MAX_PROFILE_CONTENT_LENGTH = 20_000;

/**
 * Application Service da Base de Conhecimento (Nível 1) — o "Cérebro da IA".
 * Orquestra ler e gravar o perfil de negócio de um tenant. Vive em
 * `services/ai/` (mesmo bounded context que consome o perfil no `PromptBuilder`).
 *
 * Valida a existência do tenant antes de ler/gravar (mesmo padrão de
 * `AiInteractionsService.assertTenantExists`) — evita criar um perfil órfão
 * para um `tenantId` que não existe. NÃO valida tamanho aqui: o limite é
 * aplicado na Presentation (zod), antes de chegar ao service, junto das demais
 * validações de forma do input (mesma divisão já usada nos outros routers).
 */
export class AiBusinessProfileService {
  constructor(
    private readonly aiBusinessProfileRepository: AiBusinessProfileRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly logger: Logger,
  ) {}

  async getProfile(tenantId: string): Promise<AiBusinessProfile | null> {
    await this.assertTenantExists(tenantId);
    return this.aiBusinessProfileRepository.findByTenant(tenantId);
  }

  async saveProfile(tenantId: string, content: string): Promise<AiBusinessProfile> {
    await this.assertTenantExists(tenantId);
    return this.aiBusinessProfileRepository.upsert(tenantId, content);
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      this.logger.warn('Operação de ai-profile recusada: tenant inexistente', { tenantId });
      throw new TenantNotFoundError(tenantId);
    }
  }
}
