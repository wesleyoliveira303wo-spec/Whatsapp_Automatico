export interface ChangeConversationStatusInput {
  /** Conversation identifier */
  id: string;
  /** Tenant identifier */
  tenantId: string;
  /** New status */
  status: string; // will be validated against enum
}
