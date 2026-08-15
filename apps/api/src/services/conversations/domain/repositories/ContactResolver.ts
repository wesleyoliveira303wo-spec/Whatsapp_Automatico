/**
 * Porta ESTREITA para `services/conversations` alcançar a identidade de
 * contato (`services/contacts`) sem conhecer aquele bounded context — Fase L,
 * Bloco L1.
 *
 * Mesmo padrão e mesmo motivo de `AiAvailabilityRepository` (Botão POWER, que
 * lê um booleano de `AiBusinessProfile` sem importar o domínio de IA) e de
 * `MediaDownloader`/`MediaSender` (que alcançam o WhatsApp sem importar
 * Baileys): quando um contexto precisa de UMA informação de outro, nasce uma
 * porta de um método só, não uma dependência entre domínios.
 *
 * A implementação vive na composição, traduzindo JID → telefone canônico →
 * `WhatsAppContact`. Este contrato não menciona telefone, normalização nem
 * Prisma de propósito: `MessageIngestionService` só precisa saber "quem é a
 * pessoa deste endereço", e nada mais.
 */
export interface ContactResolver {
  /**
   * Devolve o `id` do contato correspondente a `contactJid`, criando-o se for
   * a primeira vez que essa pessoa aparece.
   *
   * Devolve `undefined` — nunca lança — quando não há identidade a resolver.
   * O caso mais comum e permanente é o endereço `@lid` (formato de privacidade
   * do WhatsApp), que não contém telefone algum: numa base real deste projeto,
   * 13 de 51 conversas. Ausência de contato é resultado NORMAL, não erro; a
   * conversa segue funcionando sem vínculo.
   */
  resolveByWhatsAppJid(tenantId: string, contactJid: string): Promise<string | undefined>;
}
