import { Contact } from '../entities/Contact';

export interface ContactRepository {
  findById(id: string): Promise<Contact | null>;
  findByPhoneNumber(tenantId: string, phoneNumber: string): Promise<Contact | null>;
  save(contact: Contact): Promise<void>;
  delete(id: string): Promise<void>;
}

// Note: Contact entity import is avoided to keep pure interface file lightweight.
