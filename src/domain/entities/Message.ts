import { MessageDirection } from '../enums/MessageDirection';
import { MessageType } from '../enums/MessageType';
import { MessageStatus } from '../enums/MessageStatus';

export interface MessageProps {
  id: string; // UUID
  conversationId: string;
  direction: MessageDirection;
  type: MessageType;
  content: string;
  status: MessageStatus;
  providerMessageId?: string;
  sentAt?: Date;
  receivedAt: Date;
  metadata?: Record<string, unknown>;
}

export class Message {
  private props: MessageProps;

  constructor(props: MessageProps) {
    this.props = { ...props };
  }

  get id(): string { return this.props.id; }
  get conversationId(): string { return this.props.conversationId; }
  get direction(): MessageDirection { return this.props.direction; }
  get type(): MessageType { return this.props.type; }
  get content(): string { return this.props.content; }
  get status(): MessageStatus { return this.props.status; }
  get providerMessageId(): string | undefined { return this.props.providerMessageId; }
  get sentAt(): Date | undefined { return this.props.sentAt; }
  get receivedAt(): Date { return this.props.receivedAt; }
  get metadata(): Record<string, unknown> | undefined { return this.props.metadata; }

  public updateStatus(newStatus: MessageStatus, now: Date = new Date()): void {
    if (this.props.status === MessageStatus.FAILED && newStatus !== MessageStatus.FAILED) {
      throw new Error('Cannot transition from FAILED to a non‑FAILED status');
    }
    this.props.status = newStatus;
    if (newStatus === MessageStatus.SENT) {
      this.props.sentAt = now;
    }
  }
}
