import { ConsentEvent } from '../../../../src/services/contacts/domain/entities/Contact';
import {
  ConsentEventRepository,
  RecordConsentEventData,
} from '../../../../src/services/contacts/domain/repositories/ConsentEventRepository';

const FIXED_NOW = new Date('2026-08-16T00:00:00.000Z');

/** Fake em memória de `ConsentEventRepository` (Fase L, Bloco L2) — append-only, sem banco. */
export class FakeConsentEventRepository implements ConsentEventRepository {
  private readonly events: ConsentEvent[] = [];
  private nextId = 1;

  async record(data: RecordConsentEventData): Promise<ConsentEvent> {
    const event: ConsentEvent = {
      id: `consent-${this.nextId++}`,
      tenantId: data.tenantId,
      contactId: data.contactId,
      type: data.type,
      reason: data.reason,
      actorUserId: data.actorUserId,
      occurredAt: FIXED_NOW,
    };
    this.events.push(event);
    return event;
  }

  /** Helper de teste: todos os eventos registrados, na ordem em que chegaram. */
  getAll(): readonly ConsentEvent[] {
    return this.events;
  }
}
