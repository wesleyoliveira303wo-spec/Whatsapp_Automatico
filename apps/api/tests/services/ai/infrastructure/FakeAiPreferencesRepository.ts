import { AiPreferences } from '../../../../src/services/ai/domain/entities/AiPreferences';
import {
  AiPreferencesRepository,
  AiPreferencesSaveData,
} from '../../../../src/services/ai/domain/repositories/AiPreferencesRepository';

/**
 * Fake em memória de `AiPreferencesRepository` (Cérebro da IA v3, Fase 3) —
 * mesmo papel/estrutura de `FakeAiBusinessProfileRepository`: determinístico,
 * sem banco, com `seed`/`failNextFind` para exercitar a degradação graciosa.
 */
export class FakeAiPreferencesRepository implements AiPreferencesRepository {
  private readonly rows = new Map<string, AiPreferences>();
  private shouldFailNextFind = false;

  private static key(tenantId: string, sessionName: string): string {
    return `${tenantId}::${sessionName}`;
  }

  async findByTenantAndSession(
    tenantId: string,
    sessionName: string,
  ): Promise<AiPreferences | null> {
    if (this.shouldFailNextFind) {
      this.shouldFailNextFind = false;
      throw new Error('falha simulada de leitura das preferências');
    }
    return this.rows.get(FakeAiPreferencesRepository.key(tenantId, sessionName)) ?? null;
  }

  async upsert(
    tenantId: string,
    sessionName: string,
    data: AiPreferencesSaveData,
  ): Promise<AiPreferences> {
    const key = FakeAiPreferencesRepository.key(tenantId, sessionName);
    const existing = this.rows.get(key);
    const row: AiPreferences = {
      tenantId,
      sessionName,
      updatedAt: new Date('2026-08-26T00:00:00.000Z'),
      autonomyLevel: data.autonomyLevel ?? existing?.autonomyLevel ?? 'balanced',
      maxDiscountPercent:
        data.maxDiscountPercent !== undefined
          ? data.maxDiscountPercent
          : (existing?.maxDiscountPercent ?? null),
      topicsToAvoid:
        data.topicsToAvoid !== undefined ? data.topicsToAvoid : (existing?.topicsToAvoid ?? null),
      escalateAfterAttempts:
        data.escalateAfterAttempts !== undefined
          ? data.escalateAfterAttempts
          : (existing?.escalateAfterAttempts ?? null),
      customHandoffMessage:
        data.customHandoffMessage !== undefined
          ? data.customHandoffMessage
          : (existing?.customHandoffMessage ?? null),
    };
    this.rows.set(key, row);
    return row;
  }

  /** Helper de teste: pré-carrega preferências completas para uma sessão. */
  seed(tenantId: string, sessionName: string, data: Partial<AiPreferencesSaveData>): void {
    this.rows.set(FakeAiPreferencesRepository.key(tenantId, sessionName), {
      tenantId,
      sessionName,
      updatedAt: new Date('2026-08-26T00:00:00.000Z'),
      autonomyLevel: data.autonomyLevel ?? 'balanced',
      maxDiscountPercent: data.maxDiscountPercent ?? null,
      topicsToAvoid: data.topicsToAvoid ?? null,
      escalateAfterAttempts: data.escalateAfterAttempts ?? null,
      customHandoffMessage: data.customHandoffMessage ?? null,
    });
  }

  /** Helper de teste: força a próxima chamada a findByTenantAndSession() a rejeitar, uma única vez. */
  failNextFind(): void {
    this.shouldFailNextFind = true;
  }
}
