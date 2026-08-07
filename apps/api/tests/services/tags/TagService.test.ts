import { TagService } from '../../../src/services/tags/application/TagService';
import { TagNotFoundError } from '../../../src/services/tags/domain/errors/TagNotFoundError';
import { TenantNotFoundError } from '../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../shared/tenant/FakeTenantRepository';
import { FakeTagRepository } from './infrastructure/FakeTagRepository';

const SESSION = 'sessao-1';

function buildSut(): { sut: TagService; tags: FakeTagRepository; tenants: FakeTenantRepository } {
  const tenants = new FakeTenantRepository();
  tenants.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
  const tags = new FakeTagRepository();
  const sut = new TagService(tags, tenants, new NoopLogger());
  return { sut, tags, tenants };
}

describe('TagService (Redesign 2026-08-05, R4)', () => {
  describe('listTags', () => {
    it('devolve lista vazia quando a sessão não tem nenhuma tag', async () => {
      const { sut } = buildSut();

      expect(await sut.listTags('tenant-1', SESSION)).toEqual([]);
    });

    it('devolve as tags cadastradas', async () => {
      const { sut, tags } = buildSut();
      tags.seed('tenant-1', SESSION, 'Urgente', 'red');

      const list = await sut.listTags('tenant-1', SESSION);

      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ name: 'Urgente', color: 'red' });
    });

    it('não mistura tags de sessões diferentes do mesmo tenant', async () => {
      const { sut, tags } = buildSut();
      tags.seed('tenant-1', SESSION, 'Sessão 1', 'blue');
      tags.seed('tenant-1', 'sessao-2', 'Sessão 2', 'green');

      const list = await sut.listTags('tenant-1', SESSION);

      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('Sessão 1');
    });

    it('lança TenantNotFoundError quando o tenant não existe', async () => {
      const { sut } = buildSut();

      await expect(sut.listTags('tenant-inexistente', SESSION)).rejects.toThrow(
        TenantNotFoundError,
      );
    });
  });

  describe('createTag', () => {
    it('cria e devolve a tag persistida', async () => {
      const { sut, tags } = buildSut();

      const created = await sut.createTag('tenant-1', SESSION, 'VIP', 'purple');

      expect(created).toMatchObject({ name: 'VIP', color: 'purple' });
      expect(await tags.listBySession('tenant-1', SESSION)).toHaveLength(1);
    });

    it('lança TenantNotFoundError quando o tenant não existe (não cria linha órfã)', async () => {
      const { sut, tags } = buildSut();

      await expect(sut.createTag('tenant-inexistente', SESSION, 'x', 'gray')).rejects.toThrow(
        TenantNotFoundError,
      );
      expect(await tags.listBySession('tenant-inexistente', SESSION)).toEqual([]);
    });
  });

  describe('updateTag', () => {
    it('atualiza nome e cor e devolve a tag atualizada', async () => {
      const { sut, tags } = buildSut();
      const id = tags.seed('tenant-1', SESSION, 'Nome antigo', 'gray');

      const updated = await sut.updateTag('tenant-1', SESSION, id, {
        name: 'Nome novo',
        color: 'teal',
      });

      expect(updated).toMatchObject({ name: 'Nome novo', color: 'teal' });
    });

    it('lança TagNotFoundError quando o id não existe', async () => {
      const { sut } = buildSut();

      await expect(
        sut.updateTag('tenant-1', SESSION, 'id-inexistente', { name: 'x' }),
      ).rejects.toThrow(TagNotFoundError);
    });

    it('lança TagNotFoundError quando o id existe mas é de outra sessão (IDOR-safe)', async () => {
      const { sut, tags } = buildSut();
      const id = tags.seed('tenant-1', 'outra-sessao', 'Tag de outra sessão', 'gray');

      await expect(sut.updateTag('tenant-1', SESSION, id, { name: 'x' })).rejects.toThrow(
        TagNotFoundError,
      );
    });

    it('lança TagNotFoundError quando o id existe mas é de outro tenant (IDOR-safe)', async () => {
      const { sut, tags, tenants } = buildSut();
      tenants.seed({ id: 'tenant-2', name: 'Empresa Dois', apiKeyHash: 'hash-2' });
      const id = tags.seed('tenant-2', SESSION, 'Tag de outro tenant', 'gray');

      await expect(sut.updateTag('tenant-1', SESSION, id, { name: 'x' })).rejects.toThrow(
        TagNotFoundError,
      );
    });
  });

  describe('removeTag', () => {
    it('remove a tag existente', async () => {
      const { sut, tags } = buildSut();
      const id = tags.seed('tenant-1', SESSION, 'Para remover', 'gray');

      await sut.removeTag('tenant-1', SESSION, id);

      expect(await tags.listBySession('tenant-1', SESSION)).toEqual([]);
    });

    it('lança TagNotFoundError quando o id não existe', async () => {
      const { sut } = buildSut();

      await expect(sut.removeTag('tenant-1', SESSION, 'id-inexistente')).rejects.toThrow(
        TagNotFoundError,
      );
    });
  });

  describe('assignTag', () => {
    it('atribui a tag à conversa quando ambas pertencem ao mesmo tenant/sessão', async () => {
      const { sut, tags } = buildSut();
      const tagId = tags.seed('tenant-1', SESSION, 'Urgente', 'red');
      tags.seedConversation('conversation-1', 'tenant-1', SESSION);

      await sut.assignTag('tenant-1', 'conversation-1', tagId);

      expect(tags.isAssigned('conversation-1', tagId)).toBe(true);
    });

    it('lança TagNotFoundError quando a conversa não pertence ao tenant', async () => {
      const { sut, tags } = buildSut();
      const tagId = tags.seed('tenant-1', SESSION, 'Urgente', 'red');
      tags.seedConversation('conversation-1', 'tenant-2', SESSION);

      await expect(sut.assignTag('tenant-1', 'conversation-1', tagId)).rejects.toThrow(
        TagNotFoundError,
      );
    });

    it('lança TagNotFoundError quando a tag é de outra sessão (mesmo tenant)', async () => {
      const { sut, tags } = buildSut();
      const tagId = tags.seed('tenant-1', 'outra-sessao', 'Urgente', 'red');
      tags.seedConversation('conversation-1', 'tenant-1', SESSION);

      await expect(sut.assignTag('tenant-1', 'conversation-1', tagId)).rejects.toThrow(
        TagNotFoundError,
      );
    });

    it('lança TenantNotFoundError quando o tenant não existe', async () => {
      const { sut } = buildSut();

      await expect(sut.assignTag('tenant-inexistente', 'conversation-1', 'tag-1')).rejects.toThrow(
        TenantNotFoundError,
      );
    });
  });

  describe('unassignTag', () => {
    it('remove a atribuição existente', async () => {
      const { sut, tags } = buildSut();
      const tagId = tags.seed('tenant-1', SESSION, 'Urgente', 'red');
      tags.seedConversation('conversation-1', 'tenant-1', SESSION);
      await sut.assignTag('tenant-1', 'conversation-1', tagId);

      await sut.unassignTag('tenant-1', 'conversation-1', tagId);

      expect(tags.isAssigned('conversation-1', tagId)).toBe(false);
    });

    it('é idempotente — remover uma atribuição inexistente não lança erro', async () => {
      const { sut, tags } = buildSut();
      tags.seedConversation('conversation-1', 'tenant-1', SESSION);

      await expect(
        sut.unassignTag('tenant-1', 'conversation-1', 'tag-nunca-atribuida'),
      ).resolves.toBeUndefined();
    });

    it('lança TagNotFoundError quando a conversa não pertence ao tenant', async () => {
      const { sut, tags } = buildSut();
      tags.seedConversation('conversation-1', 'tenant-2', SESSION);

      await expect(sut.unassignTag('tenant-1', 'conversation-1', 'tag-1')).rejects.toThrow(
        TagNotFoundError,
      );
    });
  });
});
