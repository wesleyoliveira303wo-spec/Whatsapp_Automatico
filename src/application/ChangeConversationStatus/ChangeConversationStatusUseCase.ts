import { ConversationRepository } from '../../domain/repositories/ConversationRepository';
import { ChangeConversationStatusInput } from './ChangeConversationStatusInput';
import { ChangeConversationStatusOutput } from './ChangeConversationStatusOutput';
import { ConversationNotFoundError } from '../errors/ConversationNotFoundError';
import { InvalidConversationStatusError } from '../errors/InvalidConversationStatusError';
import { ConversationStatus } from '../../domain/enums/ConversationStatus';

/**
 * Use‑case responsible for changing the status of a conversation.
 *
 * It validates:
 *   1. Conversation exists.
 *   2. TenantId matches the conversation tenant.
 *   3. The supplied status is a valid enum value.
 *   4. The domain transition rules defined in the Conversation entity
 *      (e.g., cannot move from CLOSED to a non‑CLOSED state).
 */
export class ChangeConversationStatusUseCase {
  constructor(private readonly conversationRepo: ConversationRepository) {}

  async execute(input: ChangeConversationStatusInput): Promise<ChangeConversationStatusOutput> {
    const { id, tenantId, status } = input;

    // Validate enum value
    if (!Object.values(ConversationStatus).includes(status as ConversationStatus)) {
      throw new InvalidConversationStatusError(`Invalid status: ${status}`);
    }

    const conversation = await this.conversationRepo.findById(id);
    if (!conversation) {
      throw new ConversationNotFoundError(`Conversation ${id} not found`);
    }

    if (conversation.tenantId !== tenantId) {
      // Treat as not found for security – do not expose tenant mismatch details
      throw new ConversationNotFoundError(`Conversation ${id} not found for tenant ${tenantId}`);
    }

    // Domain rule validation delegated to the entity method (will throw generic Error).
    try {
      conversation.changeStatus(status as ConversationStatus);
    } catch (err) {
      // Wrap any domain‑level error with a specific application error.
      throw new InvalidConversationStatusError(err instanceof Error ? err.message : String(err));
    }

    await this.conversationRepo.save(conversation);

    return { id: conversation.id, status: conversation.status };
  }
}
