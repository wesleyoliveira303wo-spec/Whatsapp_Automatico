import { ConversationEventType } from '../enums/ConversationEventType';

export interface ConversationEventProps {
  id: string; // UUID
  conversationId: string;
  type: ConversationEventType;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export class ConversationEvent {
  private props: ConversationEventProps;

  constructor(props: ConversationEventProps) {
    this.props = { ...props };
  }

  get id(): string { return this.props.id; }
  get conversationId(): string { return this.props.conversationId; }
  get type(): ConversationEventType { return this.props.type; }
  get payload(): Record<string, unknown> { return this.props.payload; }
  get createdAt(): Date { return this.props.createdAt; }
}
