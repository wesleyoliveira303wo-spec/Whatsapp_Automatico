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
 * (default 1h) e um limite de entradas garantem que isso nunca vira
 * armazenamento permanente disfarçado.
 *
 * ISOLAMENTO POR TENANT (Fase 1, Bloco F1.10 — a auditoria pré-beta encontrou
 * o teto de entradas GLOBAL, compartilhado por todos os tenants: um tenant
 * com volume alto de envio de mídia podia expulsar (FIFO) a mídia recém-
 * enviada de OUTRO tenant, muito antes da 1h de TTL — sem nenhum vazamento de
 * dado entre tenants (a chave já incluía o `messageId`, um UUID, nunca
 * adivinhável), mas com um efeito colateral real e injusto: a Dashboard de um
 * tenant perdendo preview de mídia por causa do volume de outro). Corrigido
 * SEM lib de LRU (YAGNI, mesmo espírito de antes): cada tenant tem sua
 * própria fila de inserção (`orderByTenant`) e seu próprio teto
 * (`maxEntriesPerTenant`) — a fila de um tenant nunca expulsa a de outro.
 *
 * Efeito colateral aceito (inalterado desde a versão original): se o
 * processo reiniciar, ou o TTL expirar, uma mídia enviada pelo operador
 * deixa de ter preview na timeline — mas ela JÁ foi entregue no WhatsApp de
 * verdade; é só a Dashboard que perde a prévia visual depois de um tempo.
 */
export class AgentMediaCache {
  private readonly entries = new Map<
    string,
    { mimeType: string; fileName?: string; data: Buffer; expiresAt: number }
  >();
  /** Ordem de inserção por tenant (mais antiga primeiro) — usada só para decidir quem expulsar quando o teto DESTE tenant estoura. */
  private readonly orderByTenant = new Map<string, string[]>();

  constructor(
    private readonly ttlMs: number = 60 * 60 * 1000,
    private readonly maxEntriesPerTenant: number = 200,
  ) {}

  private static key(tenantId: string, messageId: string): string {
    return `${tenantId}::${messageId}`;
  }

  set(
    tenantId: string,
    messageId: string,
    media: { mimeType: string; fileName?: string; data: Buffer },
  ): void {
    const order = this.orderByTenant.get(tenantId) ?? [];
    if (order.length >= this.maxEntriesPerTenant) {
      // Expulsa a entrada mais antiga DESTE tenant — nunca a de outro.
      const oldestMessageId = order.shift();
      if (oldestMessageId !== undefined) {
        this.entries.delete(AgentMediaCache.key(tenantId, oldestMessageId));
      }
    }
    order.push(messageId);
    this.orderByTenant.set(tenantId, order);
    this.entries.set(AgentMediaCache.key(tenantId, messageId), {
      ...media,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  get(
    tenantId: string,
    messageId: string,
  ): { mimeType: string; fileName?: string; data: Buffer } | undefined {
    const key = AgentMediaCache.key(tenantId, messageId);
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return { mimeType: entry.mimeType, fileName: entry.fileName, data: entry.data };
  }
}
