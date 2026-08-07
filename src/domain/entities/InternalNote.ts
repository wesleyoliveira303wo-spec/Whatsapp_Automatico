export interface InternalNoteProps {
  id: string; // UUID
  conversationId: string;
  authorId: string; // user id
  content: string;
  createdAt: Date;
}

export class InternalNote {
  private props: InternalNoteProps;

  constructor(props: InternalNoteProps) {
    this.props = { ...props };
  }

  get id(): string {
    return this.props.id;
  }
  get conversationId(): string {
    return this.props.conversationId;
  }
  get authorId(): string {
    return this.props.authorId;
  }
  get content(): string {
    return this.props.content;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
