import { QuickReplyService } from '../../../src/services/quickReplies/application/QuickReplyService';
import { QuickReplyNotFoundError } from '../../../src/services/quickReplies/domain/errors/QuickReplyNotFoundError';
import { TenantNotFoundError } from '../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../shared/tenant/FakeTenantRepository';
import { FakeQuickReplyRepository } from './infrastructure/FakeQuickReplyRepository';

const SESSION = 'sessao-1';

function buildSut(): {
  sut: QuickReplyService;
  quickReplies: FakeQuickReplyRepository;
  tenants: FakeTenantRepository;
} {
  const tenants = new FakeTenantRepository();
  tenants.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
  const quickReplies = new FakeQuickReplyRepository();
  const sut = new QuickReplyService(quickReplies, tenants, new NoopLogger());
  return { sut, quickReplies, tenants };
}

describe('QuickReplyService (Fase 1, Bloco F1.9)', () => {
  describe('listQuickReplies', () => {
    it('devolve lista vazia quando a sessão não tem nenhuma resposta', async () => {
      const { sut } = buildSut();

      expect(await sut.listQuickReplies('tenant-1', SESSION)).toEqual([]);
    });

    it('devolve as respostas cadastradas', async () => {
      const { sut, quickReplies } = buildSut();
      quickReplies.seed('tenant-1', SESSION, 'Bom dia! Como posso ajudar?');

      const list = await sut.listQuickReplies('tenant-1', SESSION);

      expect(list).toHaveLength(1);
      expect(list[0].content).toBe('Bom dia! Como posso ajudar?');
    });

    it('não mistura respostas de sessões diferentes do mesmo tenant', async () => {
      const { sut, quickReplies } = buildSut();
      quickReplies.seed('tenant-1', SESSION, 'Resposta da sessão 1.');
      quickReplies.seed('tenant-1', 'sessao-2', 'Resposta da sessão 2.');

      const list = await sut.listQuickReplies('tenant-1', SESSION);

      expect(list).toHaveLength(1);
      expect(list[0].content).toBe('Resposta da sessão 1.');
    });

    it('lança TenantNotFoundError quando o tenant não existe', async () => {
      const { sut } = buildSut();

      await expect(sut.listQuickReplies('tenant-inexistente', SESSION)).rejects.toThrow(
        TenantNotFoundError,
      );
    });
  });

  describe('createQuickReply', () => {
    it('cria e devolve a resposta persistida', async () => {
      const { sut, quickReplies } = buildSut();

      const created = await sut.createQuickReply('tenant-1', SESSION, 'Obrigado pelo contato!');

      expect(created.content).toBe('Obrigado pelo contato!');
      expect(await quickReplies.listBySession('tenant-1', SESSION)).toHaveLength(1);
    });

    it('lança TenantNotFoundError quando o tenant não existe (não cria linha órfã)', async () => {
      const { sut, quickReplies } = buildSut();

      await expect(sut.createQuickReply('tenant-inexistente', SESSION, 'x')).rejects.toThrow(
        TenantNotFoundError,
      );
      expect(await quickReplies.listBySession('tenant-inexistente', SESSION)).toEqual([]);
    });
  });

  describe('updateQuickReply', () => {
    it('atualiza o texto e devolve a resposta atualizada', async () => {
      const { sut, quickReplies } = buildSut();
      const id = quickReplies.seed('tenant-1', SESSION, 'Texto antigo');

      const updated = await sut.updateQuickReply('tenant-1', SESSION, id, 'Texto novo');

      expect(updated.content).toBe('Texto novo');
    });

    it('lança QuickReplyNotFoundError quando o id não existe', async () => {
      const { sut } = buildSut();

      await expect(
        sut.updateQuickReply('tenant-1', SESSION, 'id-inexistente', 'x'),
      ).rejects.toThrow(QuickReplyNotFoundError);
    });

    it('lança QuickReplyNotFoundError quando o id existe mas é de outra sessão (IDOR-safe)', async () => {
      const { sut, quickReplies } = buildSut();
      const id = quickReplies.seed('tenant-1', 'outra-sessao', 'Texto de outra sessão');

      await expect(sut.updateQuickReply('tenant-1', SESSION, id, 'x')).rejects.toThrow(
        QuickReplyNotFoundError,
      );
    });

    it('lança QuickReplyNotFoundError quando o id existe mas é de outro tenant (IDOR-safe)', async () => {
      const { sut, quickReplies, tenants } = buildSut();
      tenants.seed({ id: 'tenant-2', name: 'Empresa Dois', apiKeyHash: 'hash-2' });
      const id = quickReplies.seed('tenant-2', SESSION, 'Texto de outro tenant');

      await expect(sut.updateQuickReply('tenant-1', SESSION, id, 'x')).rejects.toThrow(
        QuickReplyNotFoundError,
      );
    });
  });

  describe('removeQuickReply', () => {
    it('remove a resposta existente', async () => {
      const { sut, quickReplies } = buildSut();
      const id = quickReplies.seed('tenant-1', SESSION, 'Para remover');

      await sut.removeQuickReply('tenant-1', SESSION, id);

      expect(await quickReplies.listBySession('tenant-1', SESSION)).toEqual([]);
    });

    it('lança QuickReplyNotFoundError quando o id não existe', async () => {
      const { sut } = buildSut();

      await expect(sut.removeQuickReply('tenant-1', SESSION, 'id-inexistente')).rejects.toThrow(
        QuickReplyNotFoundError,
      );
    });
  });
});
