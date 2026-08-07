import { MessageType } from '../enums/MessageType';

export interface AttachmentProps {
  id: string; // UUID
  messageId: string;
  type: MessageType;
  url: string; // secure storage URL (e.g., S3)
  mimeType: string;
  sizeBytes: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export class Attachment {
  private props: AttachmentProps;

  constructor(props: AttachmentProps) {
    this.props = { ...props };
  }

  get id(): string {
    return this.props.id;
  }
  get messageId(): string {
    return this.props.messageId;
  }
  get type(): MessageType {
    return this.props.type;
  }
  get url(): string {
    return this.props.url;
  }
  get mimeType(): string {
    return this.props.mimeType;
  }
  get sizeBytes(): number {
    return this.props.sizeBytes;
  }
  get metadata(): Record<string, unknown> | undefined {
    return this.props.metadata;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
