export class ConversationNotFoundError extends Error {
  constructor(message = 'Conversation not found') {
    super(message);
    this.name = 'ConversationNotFoundError';
  }
}
