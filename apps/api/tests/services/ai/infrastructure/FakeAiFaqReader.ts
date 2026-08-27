import {
  AiFaqEntryInfo,
  AiFaqReader,
} from '../../../../src/services/ai/domain/repositories/AiFaqReader';

/** Cérebro da IA v3, Fase 2 — Fake de `AiFaqReader`. */
export class FakeAiFaqReader implements AiFaqReader {
  private entriesBySession = new Map<string, AiFaqEntryInfo[]>();

  seed(tenantId: string, sessionName: string, entries: AiFaqEntryInfo[]): void {
    this.entriesBySession.set(`${tenantId}:${sessionName}`, entries);
  }

  async listActiveFaqEntries(tenantId: string, sessionName: string): Promise<AiFaqEntryInfo[]> {
    return this.entriesBySession.get(`${tenantId}:${sessionName}`) ?? [];
  }
}
