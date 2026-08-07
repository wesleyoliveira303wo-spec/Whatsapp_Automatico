import { ConversationStatus } from '../enums/ConversationStatus';

export interface ConversationProps {
  id: string; // UUID
  tenantId: string;
  contactId: string; // reference to Contact
  status: ConversationStatus;
  assignedTo?: string; // user id
  leadId?: string;
  openedAt?: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class Conversation {
  private props: ConversationProps;

  constructor(props: ConversationProps) {
    this.props = { ...props };
  }

  // getters
  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get contactId(): string {
    return this.props.contactId;
  }
  get status(): ConversationStatus {
    return this.props.status;
  }
  get assignedTo(): string | undefined {
    return this.props.assignedTo;
  }
  get leadId(): string | undefined {
    return this.props.leadId;
  }
  get openedAt(): Date | undefined {
    return this.props.openedAt;
  }
  get closedAt(): Date | undefined {
    return this.props.closedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  // business methods
  public changeStatus(newStatus: ConversationStatus, now: Date = new Date()): void {
    // simple validation: allow any transition except from CLOSED to non‑CLOSED
    if (
      this.props.status === ConversationStatus.CLOSED &&
      newStatus !== ConversationStatus.CLOSED
    ) {
      throw new Error('Cannot transition from CLOSED to a non‑CLOSED status');
    }
    this.props.status = newStatus;
    this.props.updatedAt = now;
    if (newStatus === ConversationStatus.CLOSED) {
      this.props.closedAt = now;
    }
  }

  public assignTo(userId: string, now: Date = new Date()): void {
    this.props.assignedTo = userId;
    this.props.updatedAt = now;
  }
}
