import { AiFaqService } from '../../../src/services/aiFaq/application/AiFaqService';
import { AiFaqEntryNotFoundError } from '../../../src/services/aiFaq/domain/errors/AiFaqEntryNotFoundError';
import { TenantNotFoundError } from '../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../shared/tenant/FakeTenantRepository';
import { FakeAiFaqRepository } from './infrastructure/FakeAiFaqRepository';

const SESSION = 'sessao-1';

function buildSut(): {
  sut: AiFaqService;
  aiFaq: FakeAiFaqRepository;
  tenants: FakeTenantRepository;
} {
  const tenants = new FakeTenantRepository();
  tenants.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
  const aiFaq = new FakeAiFaqRepository();
  const sut = new AiFaqService(aiFaq, tenants, new NoopLogger());
  return { sut, aiFaq, tenants };
}

describe('AiFaqService (Cérebro da IA v3, Fase 2)', () => {
  describe('listFaqEntries', () => {
    it('devolve lista vazia quando a sessão não tem nenhuma FAQ', async () => {
      const { sut } = buildSut();

      expect(await sut.listFaqEntries('tenant-1', SESSION)).toEqual([]);
    });

    it('devolve as FAQs cadastradas, inclusive inativas (tela de gestão)', async () => {
      const { sut, aiFaq } = buildSut();
      aiFaq.seed('tenant-1', SESSION, 'Qual o preço?', 'R$ 990', { category: 'Preços' });
      aiFaq.seed('tenant-1', SESSION, 'Promoção antiga?', 'Encerrada', { active: false });

      const list = await sut.listFaqEntries('tenant-1', SESSION);

      expect(list).toHaveLength(2);
    });

    it('não mistura FAQs de sessões diferentes do mesmo tenant', async () => {
      const { sut, aiFaq } = buildSut();
      aiFaq.seed('tenant-1', SESSION, 'Da sessão 1', 'Resposta 1');
      aiFaq.seed('tenant-1', 'sessao-2', 'Da sessão 2', 'Resposta 2');

      const list = await sut.listFaqEntries('tenant-1', SESSION);

      expect(list).toHaveLength(1);
      expect(list[0].question).toBe('Da sessão 1');
    });

    it('lança TenantNotFoundError quando o tenant não existe', async () => {
      const { sut } = buildSut();

      await expect(sut.listFaqEntries('tenant-inexistente', SESSION)).rejects.toThrow(
        TenantNotFoundError,
      );
    });
  });

  describe('listActiveFaqEntries', () => {
    it('devolve só as FAQs ativas (usado pela injeção no prompt)', async () => {
      const { sut, aiFaq } = buildSut();
      aiFaq.seed('tenant-1', SESSION, 'Ativa', 'Resposta ativa', { active: true });
      aiFaq.seed('tenant-1', SESSION, 'Inativa', 'Resposta inativa', { active: false });

      const list = await sut.listActiveFaqEntries('tenant-1', SESSION);

      expect(list).toHaveLength(1);
      expect(list[0].question).toBe('Ativa');
    });
  });

  describe('createFaqEntry', () => {
    it('cria e devolve a FAQ persistida, ativa por padrão', async () => {
      const { sut, aiFaq } = buildSut();

      const created = await sut.createFaqEntry(
        'tenant-1',
        SESSION,
        'Vocês entregam?',
        'Sim, entregamos.',
        null,
      );

      expect(created.question).toBe('Vocês entregam?');
      expect(created.active).toBe(true);
      expect(await aiFaq.listBySession('tenant-1', SESSION)).toHaveLength(1);
    });

    it('lança TenantNotFoundError quando o tenant não existe (não cria linha órfã)', async () => {
      const { sut, aiFaq } = buildSut();

      await expect(
        sut.createFaqEntry('tenant-inexistente', SESSION, 'P', 'R', null),
      ).rejects.toThrow(TenantNotFoundError);
      expect(await aiFaq.listBySession('tenant-inexistente', SESSION)).toEqual([]);
    });
  });

  describe('updateFaqEntry', () => {
    it('atualiza parcialmente (só o toggle active) sem tocar em pergunta/resposta', async () => {
      const { sut, aiFaq } = buildSut();
      const id = aiFaq.seed('tenant-1', SESSION, 'P', 'R');

      const updated = await sut.updateFaqEntry('tenant-1', SESSION, id, { active: false });

      expect(updated.active).toBe(false);
      expect(updated.question).toBe('P');
    });

    it('atualiza pergunta/resposta/categoria juntas', async () => {
      const { sut, aiFaq } = buildSut();
      const id = aiFaq.seed('tenant-1', SESSION, 'Velha pergunta', 'Velha resposta');

      const updated = await sut.updateFaqEntry('tenant-1', SESSION, id, {
        question: 'Nova pergunta',
        answer: 'Nova resposta',
        category: 'Geral',
      });

      expect(updated.question).toBe('Nova pergunta');
      expect(updated.answer).toBe('Nova resposta');
      expect(updated.category).toBe('Geral');
    });

    it('lança AiFaqEntryNotFoundError quando o id não existe', async () => {
      const { sut } = buildSut();

      await expect(
        sut.updateFaqEntry('tenant-1', SESSION, 'id-inexistente', { active: false }),
      ).rejects.toThrow(AiFaqEntryNotFoundError);
    });

    it('lança AiFaqEntryNotFoundError quando o id existe mas é de outra sessão (IDOR-safe)', async () => {
      const { sut, aiFaq } = buildSut();
      const id = aiFaq.seed('tenant-1', 'outra-sessao', 'P', 'R');

      await expect(sut.updateFaqEntry('tenant-1', SESSION, id, { active: false })).rejects.toThrow(
        AiFaqEntryNotFoundError,
      );
    });

    it('lança AiFaqEntryNotFoundError quando o id existe mas é de outro tenant (IDOR-safe)', async () => {
      const { sut, aiFaq, tenants } = buildSut();
      tenants.seed({ id: 'tenant-2', name: 'Empresa Dois', apiKeyHash: 'hash-2' });
      const id = aiFaq.seed('tenant-2', SESSION, 'P', 'R');

      await expect(sut.updateFaqEntry('tenant-1', SESSION, id, { active: false })).rejects.toThrow(
        AiFaqEntryNotFoundError,
      );
    });
  });

  describe('removeFaqEntry', () => {
    it('remove a FAQ existente', async () => {
      const { sut, aiFaq } = buildSut();
      const id = aiFaq.seed('tenant-1', SESSION, 'P', 'R');

      await sut.removeFaqEntry('tenant-1', SESSION, id);

      expect(await aiFaq.listBySession('tenant-1', SESSION)).toEqual([]);
    });

    it('lança AiFaqEntryNotFoundError quando o id não existe', async () => {
      const { sut } = buildSut();

      await expect(sut.removeFaqEntry('tenant-1', SESSION, 'id-inexistente')).rejects.toThrow(
        AiFaqEntryNotFoundError,
      );
    });
  });
});
