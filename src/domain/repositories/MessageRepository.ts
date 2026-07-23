import { Message } from '../entities/Message';

export interface MessageRepository {
  findById(id: string): Promise<Message | null>;
  findByConversationId(conversationId: string): Promise<Message[]>;
  save(message: Message): Promise<void>;
  delete(id: string): Promise<void>;
}

// Note: Message entity import is avoided here to keep the interface lightweight.
