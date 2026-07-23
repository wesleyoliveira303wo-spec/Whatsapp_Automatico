import { ConversationRepository } from '../../domain/repositories/ConversationRepository';
import { GetConversationInput } from './GetConversationInput';
import { GetConversationOutput } from './GetConversationOutput';
import { ConversationNotFoundError } from '../errors/ConversationNotFoundError';

/**
 * Use‑case responsável por recuperar uma conversa existente.
 * Segue o contrato da camada Application: recebe um DTO de entrada
 * e devolve um DTO de saída contendo a entidade de domínio.
 */
export class GetConversationUseCase {
  constructor(private readonly conversationRepo: ConversationRepository) {}

  async execute(input: GetConversationInput): Promise<GetConversationOutput> {
    const conversation = await this.conversationRepo.findById(input.id);
    if (!conversation || conversation.tenantId !== input.tenantId) {
      throw new ConversationNotFoundError(`Conversation ${input.id} not found for tenant ${input.tenantId}`);
    }
    return { conversation };
  }
}
