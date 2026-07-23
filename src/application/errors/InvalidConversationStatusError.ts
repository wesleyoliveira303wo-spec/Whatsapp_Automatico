export class InvalidConversationStatusError extends Error {
  /**
   * HTTP status code associated with the error (400 Bad Request).
   */
  public readonly statusCode: number = 400;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidConversationStatusError';
  }
}
