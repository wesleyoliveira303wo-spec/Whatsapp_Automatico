import { Logger } from '../../../shared/domain/Logger';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { parseCsv } from '../domain/csvParsing';
import { InvalidImportRow, mapImportRows } from '../domain/contactImport';
import { ContactRepository } from '../domain/repositories/ContactRepository';
import { TooManyImportRowsError } from '../domain/errors/TooManyImportRowsError';

/**
 * Teto de linhas de dados por importação — defesa contra upload patológico
 * (um CSV de linhas minúsculas pode caber num limite de bytes generoso e
 * ainda assim ter centenas de milhares de linhas). 5.000 é folgado para o
 * uso real deste produto (PMEs, não listas de massa) e processa em segundos.
 */
export const MAX_IMPORT_ROWS = 5_000;

/** Resultado de uma importação — o que a UI mostra ao operador. */
export interface ContactImportReport {
  totalRows: number;
  /** Contatos que não existiam e foram criados. */
  created: number;
  /** Contatos que já existiam (tipicamente vindos do WhatsApp, sem nome) e ganharam nome. */
  enriched: number;
  /** Contatos que já existiam e já tinham nome — a importação não alterou nada (nome protegido). */
  unchanged: number;
  invalid: InvalidImportRow[];
}

/**
 * Application Service da importação de leads por planilha — Fase L, Bloco
 * L1b.
 *
 * Fluxo: parseia o CSV (Domain, puro) → valida/normaliza cada linha (Domain,
 * puro) → para cada linha válida, `findOrCreateByPhone` (deduplicação
 * atômica) e, se o contato já existia sem nome, `setNameIfMissing` (Fase L,
 * Bloco L1). `source: 'import'` só é usado na CRIAÇÃO — um contato que já
 * existia mantém a origem original (ver docstring de `setNameIfMissing`).
 *
 * Cada linha é processada sequencialmente, não em paralelo: são operações de
 * escrita idempotentes, mas correr milhares em paralelo sobrecarregaria a
 * conexão do Postgres sem necessidade real (mesmo racional já usado para
 * restauração de sessões WhatsApp, `index.ts`).
 */
export class ContactImportService {
  constructor(
    private readonly contactRepository: ContactRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly logger: Logger,
  ) {}

  async importCsv(tenantId: string, csvText: string): Promise<ContactImportReport> {
    await this.assertTenantExists(tenantId);

    const rows = parseCsv(csvText);
    // A primeira linha é cabeçalho — `mapImportRows` já trata isso; aqui só
    // contamos linhas de DADO para o teto e o relatório.
    const totalRows = Math.max(rows.length - 1, 0);

    if (totalRows > MAX_IMPORT_ROWS) {
      throw new TooManyImportRowsError(totalRows, MAX_IMPORT_ROWS);
    }

    const { valid, invalid } = mapImportRows(rows);

    let created = 0;
    let enriched = 0;
    let unchanged = 0;

    for (const row of valid) {
      const existing = await this.contactRepository.findByPhone(tenantId, row.phoneE164);

      const contact = await this.contactRepository.findOrCreateByPhone({
        tenantId,
        phoneE164: row.phoneE164,
        name: row.name,
        source: 'import',
      });

      if (!existing) {
        created += 1;
        continue;
      }

      if (!existing.name && row.name) {
        await this.contactRepository.setNameIfMissing(tenantId, contact.id, row.name);
        enriched += 1;
      } else {
        unchanged += 1;
      }
    }

    this.logger.info('Importação de contatos concluída', {
      tenantId,
      totalRows,
      created,
      enriched,
      unchanged,
      invalidCount: invalid.length,
    });

    return { totalRows, created, enriched, unchanged, invalid };
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      this.logger.warn('Importação de contatos recusada: tenant inexistente', { tenantId });
      throw new TenantNotFoundError(tenantId);
    }
  }
}
