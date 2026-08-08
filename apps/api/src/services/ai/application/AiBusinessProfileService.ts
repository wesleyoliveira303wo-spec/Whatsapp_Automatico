import { Logger } from '../../../shared/domain/Logger';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { AiBusinessProfile } from '../domain/entities/AiBusinessProfile';
import {
  AiBusinessProfileRepository,
  AiProfileSaveData,
} from '../domain/repositories/AiBusinessProfileRepository';

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
 * Orquestra ler e gravar o perfil de negócio de UMA SESSÃO de WhatsApp. Vive
 * em `services/ai/` (mesmo bounded context que consome o perfil no
 * `PromptBuilder`).
 *
 * Migrado de 1:1 por TENANT para 1:1 por (TENANT, SESSÃO) — Milestone 6,
 * Bloco M6H-3, 2026-07-25 (ver docstring de `AiBusinessProfile`). Este
 * Service deliberadamente NÃO valida que `sessionName` existe de fato como
 * `WhatsAppSession` — esse bounded context (`services/whatsapp`) não é
 * conhecido aqui (mesmo princípio de baixo acoplamento já seguido pelo
 * resto do projeto); um `sessionName` que não corresponda a nenhuma sessão
 * real simplesmente nunca é lido pelo `PromptBuilder` (nenhuma mensagem
 * chega por uma sessão inexistente) — não é um estado prejudicial, só inerte.
 *
 * Valida a existência do TENANT antes de ler/gravar (mesmo padrão de
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

  async getProfile(tenantId: string, sessionName: string): Promise<AiBusinessProfile | null> {
    await this.assertTenantExists(tenantId);
    return this.aiBusinessProfileRepository.findByTenantAndSession(tenantId, sessionName);
  }

  /**
   * Salva (upsert) o perfil da sessão. F1.8 (2026-08-01): aceita `data`
   * (`AiProfileSaveData`) em vez de só `content` — inclui campos de horário de
   * atendimento. Campos opcionais não informados preservam o valor já gravado.
   * A validação de tamanho do `content` e dos demais campos é responsabilidade
   * da Presentation (zod), antes de chegar aqui — mesmo padrão pré-existente.
   */
  async saveProfile(
    tenantId: string,
    sessionName: string,
    data: AiProfileSaveData,
  ): Promise<AiBusinessProfile> {
    await this.assertTenantExists(tenantId);
    return this.aiBusinessProfileRepository.upsert(tenantId, sessionName, data);
  }

  /**
   * Fase 1 (2026-08-07) — Botão POWER: liga/desliga SÓ `aiEnabled`, sem
   * exigir o corpo inteiro do perfil (`content`/horário) — o clique no botão
   * não deveria depender de o operador ter aberto a tela do Cérebro da IA
   * antes. Ver docstring de `AiBusinessProfileRepository.setAiEnabled`.
   */
  async setAiEnabled(
    tenantId: string,
    sessionName: string,
    aiEnabled: boolean,
  ): Promise<AiBusinessProfile> {
    await this.assertTenantExists(tenantId);
    return this.aiBusinessProfileRepository.setAiEnabled(tenantId, sessionName, aiEnabled);
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      this.logger.warn('Operação de ai-profile recusada: tenant inexistente', { tenantId });
      throw new TenantNotFoundError(tenantId);
    }
  }
}
