import { AiBusinessProfile } from '../../../../src/services/ai/domain/entities/AiBusinessProfile';
import {
  AiBusinessProfileRepository,
  AiProfileSaveData,
} from '../../../../src/services/ai/domain/repositories/AiBusinessProfileRepository';

/**
 * Fake em memória de `AiBusinessProfileRepository` (Base de Conhecimento,
 * Nível 1) — mesmo papel dos demais Fakes deste projeto: determinístico, sem
 * banco. Permite pré-carregar um perfil (`seed`) e forçar uma falha de leitura
 * (`failNextFind`) para exercitar a degradação graciosa de
 * `ConversationAiService`.
 *
 * Chave composta `(tenantId, sessionName)` — migrado de 1:1 por tenant para
 * 1:1 por sessão na Milestone 6, Bloco M6H-3 (2026-07-25).
 *
 * F1.8 (2026-08-01): `upsert` recebe `AiProfileSaveData` (inclui campos de
 * horário de atendimento). `seed` mantém assinatura com só `content` para
 * retrocompatibilidade com todos os testes existentes — campos de horário
 * recebem defaults seguros (`offHoursEnabled: false`, bitmask Mon–Fri).
 */
export class FakeAiBusinessProfileRepository implements AiBusinessProfileRepository {
  private readonly profiles = new Map<string, AiBusinessProfile>();
  private shouldFailNextFind = false;

  private static key(tenantId: string, sessionName: string): string {
    return `${tenantId}::${sessionName}`;
  }

  async findByTenantAndSession(
    tenantId: string,
    sessionName: string,
  ): Promise<AiBusinessProfile | null> {
    if (this.shouldFailNextFind) {
      this.shouldFailNextFind = false;
      throw new Error('falha simulada de leitura do perfil');
    }
    return this.profiles.get(FakeAiBusinessProfileRepository.key(tenantId, sessionName)) ?? null;
  }

  async upsert(
    tenantId: string,
    sessionName: string,
    data: AiProfileSaveData,
  ): Promise<AiBusinessProfile> {
    const existing = this.profiles.get(FakeAiBusinessProfileRepository.key(tenantId, sessionName));
    const profile: AiBusinessProfile = {
      tenantId,
      sessionName,
      content: data.content,
      updatedAt: new Date('2026-07-22T00:00:00.000Z'),
      offHoursEnabled: data.offHoursEnabled ?? existing?.offHoursEnabled ?? false,
      offHoursMessage:
        data.offHoursMessage !== undefined
          ? data.offHoursMessage
          : (existing?.offHoursMessage ?? null),
      workingHoursStart:
        data.workingHoursStart !== undefined
          ? data.workingHoursStart
          : (existing?.workingHoursStart ?? null),
      workingHoursEnd:
        data.workingHoursEnd !== undefined
          ? data.workingHoursEnd
          : (existing?.workingHoursEnd ?? null),
      workingDays: data.workingDays ?? existing?.workingDays ?? 62,
      timezone: data.timezone ?? existing?.timezone ?? 'America/Sao_Paulo',
    };
    this.profiles.set(FakeAiBusinessProfileRepository.key(tenantId, sessionName), profile);
    return profile;
  }

  /**
   * Helper de teste: pré-carrega um perfil apenas com `content`. Não faz parte
   * da interface de produção. Campos de horário recebem defaults seguros
   * (`offHoursEnabled: false`, bitmask Mon–Fri) para não quebrar testes
   * existentes que só se preocupam com a base de conhecimento textual.
   */
  seed(
    tenantId: string,
    sessionName: string,
    content: string,
    offHoursOverrides?: Partial<
      Omit<AiBusinessProfile, 'tenantId' | 'sessionName' | 'content' | 'updatedAt'>
    >,
  ): void {
    this.profiles.set(FakeAiBusinessProfileRepository.key(tenantId, sessionName), {
      tenantId,
      sessionName,
      content,
      updatedAt: new Date('2026-07-22T00:00:00.000Z'),
      offHoursEnabled: offHoursOverrides?.offHoursEnabled ?? false,
      offHoursMessage: offHoursOverrides?.offHoursMessage ?? null,
      workingHoursStart: offHoursOverrides?.workingHoursStart ?? null,
      workingHoursEnd: offHoursOverrides?.workingHoursEnd ?? null,
      workingDays: offHoursOverrides?.workingDays ?? 62,
      timezone: offHoursOverrides?.timezone ?? 'America/Sao_Paulo',
    });
  }

  /** Helper de teste: força a próxima chamada a findByTenantAndSession() a rejeitar, uma única vez. */
  failNextFind(): void {
    this.shouldFailNextFind = true;
  }
}
