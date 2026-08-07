/**
 * Cache em memória, de curtíssimo prazo, para o binário de mídia que o
 * OPERADOR acabou de enviar (Fase 1, Bloco F1.3) — resolve um gap real: mídia
 * recebida tem uma referência ao CDN do WhatsApp (`MessageMediaReference`,
 * ADR #90) que permite buscar o binário de volta sob demanda a qualquer
 * momento; mídia ENVIADA pelo operador não tem essa referência (o binário só
 * existe no upload em si, antes de virar uma mensagem do WhatsApp) — sem
 * algum cache, a mensagem reapareceria na timeline sem preview visual algum
 * até... nunca, porque nunca haveria de onde buscar o binário de novo.
 *
 * Deliberadamente NÃO um storage permanente (S3/disco) — mesma filosofia de
 * "proxy sob demanda, nunca persistido" do ADR #90: o objetivo aqui é só
 * cobrir a janela entre o operador enviar e a timeline atualizar/o operador
 * dar reload — não virar um repositório de mídia de verdade. TTL curto
 * (default 1h) e um limite de entradas (evita crescimento sem fim se a
 * limpeza por tempo não rodar a tempo em um processo de vida muito longa)
 * garantem que isso nunca vira armazenamento permanente disfarçado.
 *
 * Efeito colateral aceito: se o processo reiniciar, ou o TTL expirar, uma
 * mídia enviada pelo operador deixa de ter preview na timeline — mas ela JÁ
 * foi entregue no WhatsApp de verdade (o cliente final sempre viu, isso não
 * depende deste cache); é só a Dashboard que perde a prévia visual depois de
 * um tempo, e isso é aceitável para o escopo desta rodada.
 */
export class AgentMediaCache {
  private readonly entries = new Map<
    string,
    { mimeType: string; fileName?: string; data: Buffer; expiresAt: number }
  >();

  constructor(
    private readonly ttlMs: number = 60 * 60 * 1000,
    private readonly maxEntries: number = 500,
  ) {}

  set(messageId: string, media: { mimeType: string; fileName?: string; data: Buffer }): void {
    if (this.entries.size >= this.maxEntries) {
      // Descarta a entrada mais antiga (primeira inserida) — Map preserva
      // ordem de inserção em JS, então a primeira chave é sempre a mais
      // antiga. Suficiente para um teto simples sem LRU de verdade (YAGNI:
      // este cache não é crítico o bastante para justificar uma lib de LRU).
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      }
    }
    this.entries.set(messageId, { ...media, expiresAt: Date.now() + this.ttlMs });
  }

  get(messageId: string): { mimeType: string; fileName?: string; data: Buffer } | undefined {
    const entry = this.entries.get(messageId);
    if (!entry) {
      return undefined;
    }
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(messageId);
      return undefined;
    }
    return { mimeType: entry.mimeType, fileName: entry.fileName, data: entry.data };
  }
}
