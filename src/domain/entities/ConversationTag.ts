export interface ConversationTagProps {
  id: string; // UUID
  conversationId: string;
  tagId: string;
  createdAt: Date;
}

export class ConversationTag {
  private props: ConversationTagProps;

  constructor(props: ConversationTagProps) {
    this.props = { ...props };
  }

  get id(): string { return this.props.id; }
  get conversationId(): string { return this.props.conversationId; }
  get tagId(): string { return this.props.tagId; }
  get createdAt(): Date { return this.props.createdAt; }
}
