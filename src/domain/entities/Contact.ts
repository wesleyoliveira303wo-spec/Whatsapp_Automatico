import { PhoneNumber } from '../value-objects/PhoneNumber';

export interface ContactProps {
  id: string; // UUID
  tenantId: string;
  phoneNumber: PhoneNumber;
  name?: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class Contact {
  private props: ContactProps;

  constructor(props: ContactProps) {
    this.props = { ...props };
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get phoneNumber(): PhoneNumber {
    return this.props.phoneNumber;
  }
  get name(): string | undefined {
    return this.props.name;
  }
  get email(): string | undefined {
    return this.props.email;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
