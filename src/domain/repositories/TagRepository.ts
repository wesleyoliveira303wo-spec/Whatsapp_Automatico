import { Tag } from '../entities/Tag';

export interface TagRepository {
  findById(id: string): Promise<Tag | null>;
  findByName(tenantId: string, name: string): Promise<Tag | null>;
  save(tag: Tag): Promise<void>;
  delete(id: string): Promise<void>;
}
