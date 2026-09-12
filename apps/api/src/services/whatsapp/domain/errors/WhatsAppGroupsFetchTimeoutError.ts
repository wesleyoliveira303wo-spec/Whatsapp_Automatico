/**
 * A listagem de grupos (`WhatsAppProvider.listGroups`) não voltou dentro do
 * teto de tempo — Disparos em grupos (2026-09-11).
 *
 * Existe porque `groupFetchAllParticipating` é uma consulta IQ no MESMO socket
 * das mensagens: uma consulta pendurada já travou a sessão inteira antes (ADR
 * #78). O provider desiste por conta própria e lança este erro — a Presentation
 * o traduz para 504, para a tela dizer "o WhatsApp não respondeu, tente de
 * novo" em vez de ficar carregando para sempre.
 */
export class WhatsAppGroupsFetchTimeoutError extends Error {
  constructor(tenantId: string, sessionName: string, timeoutMs: number) {
    super(
      `O WhatsApp não respondeu à listagem de grupos em ${timeoutMs}ms (tenantId=${tenantId}, sessionName=${sessionName}).`,
    );
    this.name = 'WhatsAppGroupsFetchTimeoutError';
  }
}
