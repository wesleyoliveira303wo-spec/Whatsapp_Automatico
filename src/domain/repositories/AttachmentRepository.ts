import { Attachment } from '../entities/Attachment';

export interface AttachmentRepository {
  findById(id: string): Promise<Attachment | null>;
  findByMessageId(messageId: string): Promise<Attachment[]>;
  save(attachment: Attachment): Promise<void>;
  delete(id: string): Promise<void>;
}

// Note: Attachment entity import omitted for same reason.
