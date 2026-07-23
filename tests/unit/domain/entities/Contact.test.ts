import { Contact } from '../../../../src/domain/entities/Contact';
import { PhoneNumber } from '../../../../src/domain/value-objects/PhoneNumber';

describe('Contact Entity', () => {
  it('should create a contact with all properties', () => {
    const contact = new Contact({
      id: 'c1',
      tenantId: 't1',
      phoneNumber: new PhoneNumber('+5511999999999'),
      name: 'John Doe',
      email: 'john@example.com',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(contact.id).toBe('c1');
    expect(contact.tenantId).toBe('t1');
    expect(contact.phoneNumber.raw).toBe('+5511999999999');
    expect(contact.name).toBe('John Doe');
    expect(contact.email).toBe('john@example.com');
  });
});
