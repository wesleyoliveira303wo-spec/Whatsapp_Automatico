import { Conversation } from '../entities/Conversation';

export interface ConversationRepository {
  findById(id: string): Promise<Conversation | null>;
  findByContactId(tenantId: string, contactId: string): Promise<Conversation | null>;
  save(conversation: Conversation): Promise<void>;
  delete(id: string): Promise<void>;
}
