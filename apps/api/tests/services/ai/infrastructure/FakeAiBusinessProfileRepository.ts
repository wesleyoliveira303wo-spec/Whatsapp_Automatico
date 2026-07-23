import { AiBusinessProfile } from '../../../../src/services/ai/domain/entities/AiBusinessProfile';
import { AiBusinessProfileRepository } from '../../../../src/services/ai/domain/repositories/AiBusinessProfileRepository';

/**
 * Fake em memória de `AiBusinessProfileRepository` (Base de Conhecimento,
 * Nível 1) — mesmo papel dos demais Fakes deste projeto: determinístico, sem
 * banco. Permite pré-carregar um perfil (`seed`) e forçar uma falha de leitura
 * (`failNextFind`) para exercitar a degradação graciosa de
 * `ConversationAiService`.
 */
export class FakeAiBusinessProfileRepository implements AiBusinessProfileRepository {
  private readonly profiles = new Map<string, AiBusinessProfile>();
  private shouldFailNextFind = false;

  async findByTenant(tenantId: string): Promise<AiBusinessProfile | null> {
    if (this.shouldFailNextFind) {
      this.shouldFailNextFind = false;
      throw new Error('falha simulada de leitura do perfil');
    }
    return this.profiles.get(tenantId) ?? null;
  }

  async upsert(tenantId: string, content: string): Promise<AiBusinessProfile> {
    const profile: AiBusinessProfile = { tenantId, content, updatedAt: new Date('2026-07-22T00:00:00.000Z') };
    this.profiles.set(tenantId, profile);
    return profile;
  }

  /** Helper de teste: pré-carrega um perfil. Não faz parte da interface de produção. */
  seed(tenantId: string, content: string): void {
    this.profiles.set(tenantId, { tenantId, content, updatedAt: new Date('2026-07-22T00:00:00.000Z') });
  }

  /** Helper de teste: força a próxima chamada a findByTenant() a rejeitar, uma única vez. */
  failNextFind(): void {
    this.shouldFailNextFind = true;
  }
}
