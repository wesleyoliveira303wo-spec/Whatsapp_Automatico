import { AiFaqEntryInfo, AiFaqReader } from '../../ai/domain/repositories/AiFaqReader';
import { AiFaqRepository } from '../domain/repositories/AiFaqRepository';
import { Logger } from '../../../shared/domain/Logger';

/**
 * Implementação real de `AiFaqReader` (port de `services/ai/domain`) —
 * Cérebro da IA v3, Fase 2. Adapter fino sobre
 * `AiFaqRepository.listActiveBySession`, mesmo papel estrutural de
 * `CampaignOriginResolverImpl`.
 *
 * NUNCA LANÇA — ver docstring da porta.
 */
export class AiFaqReaderImpl implements AiFaqReader {
  constructor(
    private readonly aiFaqRepository: AiFaqRepository,
    private readonly logger: Logger,
  ) {}

  async listActiveFaqEntries(tenantId: string, sessionName: string): Promise<AiFaqEntryInfo[]> {
    try {
      const entries = await this.aiFaqRepository.listActiveBySession(tenantId, sessionName);
      return entries.map((entry) => ({
        question: entry.question,
        answer: entry.answer,
        category: entry.category,
      }));
    } catch (error) {
      this.logger.warn('Falha ao ler FAQs ativas da sessão para o prompt', {
        tenantId,
        sessionName,
        error,
      });
      return [];
    }
  }
}
