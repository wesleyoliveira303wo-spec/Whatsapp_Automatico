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

  /**
   * Grava (ou sobrescreve) o nome de um contato já identificado — botão
   * "Salvar contato" do painel de contexto da conversa (retrofit visual
   * 2026-08-18). DIFERENTE de `resolveByWhatsAppJid`: aqui é uma ação HUMANA
   * explícita (o operador clicou e digitou um nome), então falhas devem
   * PROPAGAR (o operador precisa ver o erro), não desaparecer em `debug`/
   * `warn` como a resolução automática de identidade.
   *
   * Sobrescreve um nome já existente de propósito — diferente de
   * `ContactRepository.setNameIfMissing` (usado pela importação em lote, que
   * só preenche): uma correção manual feita pelo operador que está com a
   * pessoa na tela é sempre a fonte mais confiável disponível.
   */
  saveName(tenantId: string, contactId: string, name: string): Promise<void>;
}
