export interface TagProps {
  id: string; // UUID
  name: string; // unique per tenant
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class Tag {
  private props: TagProps;

  constructor(props: TagProps) {
    this.props = { ...props };
  }

  get id(): string { return this.props.id; }
  get name(): string { return this.props.name; }
  get tenantId(): string { return this.props.tenantId; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
