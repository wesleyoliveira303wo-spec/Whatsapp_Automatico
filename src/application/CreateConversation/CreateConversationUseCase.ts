import { Conversation } from '../../domain/entities/Conversation';
import { ConversationStatus } from '../../domain/enums/ConversationStatus';
import { ConversationRepository } from '../../domain/repositories/ConversationRepository';
import { CreateConversationInput } from './CreateConversationInput';
import { CreateConversationOutput } from './CreateConversationOutput';

export class CreateConversationUseCase {
  constructor(private readonly conversationRepo: ConversationRepository) {}

  async execute(input: CreateConversationInput): Promise<CreateConversationOutput> {
    const conversation = new Conversation({
      id: input.id,
      tenantId: input.tenantId,
      contactId: input.contactId,
      status: (input.status as ConversationStatus | undefined) ?? ConversationStatus.NEW,
      assignedTo: input.assignedTo,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await this.conversationRepo.save(conversation);
    return {
      conversationId: conversation.id,
      status: conversation.status,
      createdAt: conversation.createdAt,
    };
  }
}
