import { ContactImportService } from '../../../../src/services/contacts/application/ContactImportService';
import { TenantNotFoundError } from '../../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { TooManyImportRowsError } from '../../../../src/services/contacts/domain/errors/TooManyImportRowsError';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakeContactRepository } from '../infrastructure/FakeContactRepository';

function buildSut(): {
  service: ContactImportService;
  contacts: FakeContactRepository;
  tenants: FakeTenantRepository;
} {
  const tenants = new FakeTenantRepository();
  tenants.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
  const contacts = new FakeContactRepository();
  const service = new ContactImportService(contacts, tenants, new NoopLogger());
  return { service, contacts, tenants };
}

describe('ContactImportService', () => {
  it('cria contatos novos a partir de um CSV válido', async () => {
    const { service, contacts } = buildSut();
    const csv = 'Nome,Telefone\nMaria,5521988887777\nJoão,5521977776666';

    const report = await service.importCsv('tenant-1', csv);

    expect(report).toMatchObject({ totalRows: 2, created: 2, enriched: 0, unchanged: 0 });
    expect(report.invalid).toEqual([]);
    const maria = await contacts.findByPhone('tenant-1', '5521988887777');
    expect(maria).toMatchObject({ name: 'Maria', source: 'import' });
  });

  // O ganho central do L1b: a maioria dos contatos hoje nasceu sem nome
  // (criados automaticamente pelo WhatsApp) — a importação precisa PREENCHER
  // esses nomes, não só criar contatos novos.
  it('preenche o nome de um contato existente que ainda não tinha nome (enriquecimento)', async () => {
    const { service, contacts } = buildSut();
    const id = contacts.seed({
      tenantId: 'tenant-1',
      phoneE164: '5521988887777',
      source: 'whatsapp',
    });

    const report = await service.importCsv('tenant-1', 'Nome,Telefone\nMaria,5521988887777');

    expect(report).toMatchObject({ created: 0, enriched: 1, unchanged: 0 });
    const contact = await contacts.findById('tenant-1', id);
    expect(contact?.name).toBe('Maria');
    // `source` original é preservado — a importação não reescreve como o
    // contato entrou no sistema pela primeira vez.
    expect(contact?.source).toBe('whatsapp');
  });

  // A proteção simétrica: um nome já definido (por importação anterior ou
  // edição manual) nunca é apagado por uma reimportação.
  it('NÃO sobrescreve o nome de um contato que já tem nome', async () => {
    const { service, contacts } = buildSut();
    const id = contacts.seed({
      tenantId: 'tenant-1',
      phoneE164: '5521988887777',
      name: 'Nome Original',
      source: 'manual',
    });

    const report = await service.importCsv(
      'tenant-1',
      'Nome,Telefone\nNome Diferente,5521988887777',
    );

    expect(report).toMatchObject({ created: 0, enriched: 0, unchanged: 1 });
    const contact = await contacts.findById('tenant-1', id);
    expect(contact?.name).toBe('Nome Original');
  });

  it('reimportar o mesmo arquivo é idempotente (segunda vez: tudo unchanged)', async () => {
    const { service } = buildSut();
    const csv = 'Nome,Telefone\nMaria,5521988887777';

    await service.importCsv('tenant-1', csv);
    const second = await service.importCsv('tenant-1', csv);

    expect(second).toMatchObject({ created: 0, enriched: 0, unchanged: 1 });
  });

  it('reporta linhas inválidas sem interromper as válidas', async () => {
    const { service } = buildSut();
    const csv = 'Nome,Telefone\nMaria,5521988887777\nSem Telefone,\nInválido,123';

    const report = await service.importCsv('tenant-1', csv);

    expect(report.created).toBe(1);
    expect(report.invalid).toEqual([
      { rowNumber: 2, reason: 'missing_phone' },
      { rowNumber: 3, reason: 'invalid_phone', rawPhone: '123' },
    ]);
  });

  it('devolve relatório vazio para um CSV sem coluna de telefone reconhecível', async () => {
    const { service } = buildSut();

    const report = await service.importCsv('tenant-1', 'Nome,Idade\nMaria,30');

    expect(report.created).toBe(0);
    expect(report.invalid).toEqual([{ rowNumber: 1, reason: 'missing_phone' }]);
  });

  it('lança TenantNotFoundError para tenant inexistente', async () => {
    const { service } = buildSut();

    await expect(service.importCsv('tenant-fantasma', 'Nome,Telefone\nX,5521988887777')).rejects.toThrow(
      TenantNotFoundError,
    );
  });

  it('lança TooManyImportRowsError acima do teto de linhas', async () => {
    const { service } = buildSut();
    const rows = Array.from({ length: 5_001 }, (_, i) => `Lead ${i},552199999${String(i).padStart(4, '0')}`);
    const csv = `Nome,Telefone\n${rows.join('\n')}`;

    await expect(service.importCsv('tenant-1', csv)).rejects.toThrow(TooManyImportRowsError);
  });

  it('isola contatos por tenant — importar no tenant A não afeta o B', async () => {
    const { service, contacts, tenants } = buildSut();
    tenants.seed({ id: 'tenant-2', name: 'Empresa Dois', apiKeyHash: 'hash-2' });

    await service.importCsv('tenant-1', 'Nome,Telefone\nMaria,5521988887777');

    expect(await contacts.findByPhone('tenant-2', '5521988887777')).toBeUndefined();
  });
});
