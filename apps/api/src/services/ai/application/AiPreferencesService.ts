import { Logger } from '../../../shared/domain/Logger';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { AiPreferences } from '../domain/entities/AiPreferences';
import {
  AiPreferencesRepository,
  AiPreferencesSaveData,
} from '../domain/repositories/AiPreferencesRepository';

/**
 * Teto de tamanho do texto de "assuntos a evitar" e da mensagem customizada
 * de encaminhamento — mesmo racional de `MAX_PROFILE_CONTENT_LENGTH`: ambos
 * entram no prompt/numa mensagem real ao cliente a cada resposta, então um
 * limite generoso mas finito mantém custo/latência previsíveis.
 */
export const MAX_TOPICS_TO_AVOID_LENGTH = 2_000;
export const MAX_CUSTOM_HANDOFF_MESSAGE_LENGTH = 1_000;

/**
 * Application Service das Preferências da IA — Cérebro da IA v3, Fase 3
 * (2026-08-26). Mesmo papel/estrutura de `AiBusinessProfileService` (mesmo
 * bounded context, mesma validação de tenant antes de ler/gravar). NÃO
 * valida `sessionName` contra `services/whatsapp` (mesmo baixo acoplamento
 * já documentado em `AiBusinessProfileService`).
 */
export class AiPreferencesService {
  constructor(
    private readonly aiPreferencesRepository: AiPreferencesRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly logger: Logger,
  ) {}

  async getPreferences(tenantId: string, sessionName: string): Promise<AiPreferences | null> {
    await this.assertTenantExists(tenantId);
    return this.aiPreferencesRepository.findByTenantAndSession(tenantId, sessionName);
  }

  async savePreferences(
    tenantId: string,
    sessionName: string,
    data: AiPreferencesSaveData,
  ): Promise<AiPreferences> {
    await this.assertTenantExists(tenantId);
    return this.aiPreferencesRepository.upsert(tenantId, sessionName, data);
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      this.logger.warn('Operação de ai-preferences recusada: tenant inexistente', { tenantId });
      throw new TenantNotFoundError(tenantId);
    }
  }
}
