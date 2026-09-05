import { Logger } from '../../../shared/domain/Logger';
import { ContactAvatarSource } from '../domain/providers/ContactAvatarSource';
import { ContactAvatarCacheRepository } from '../domain/repositories/ContactAvatarCacheRepository';
import { isContactAvatarStale } from '../domain/policies/contactAvatarFreshness';

/**
 * Quantas consultas ao WhatsApp podem acontecer ao MESMO tempo, no processo
 * inteiro. Este número é a peça central do bloco, não um detalhe: a ADR #78
 * registra que uma consulta de foto sem limite travou o socket Baileys — o
 * mesmo por onde as mensagens reais passam. Duas de cada vez mantém a fila
 * andando sem nunca fazer o socket de refém.
 */
export const MAX_CONCURRENT_AVATAR_REFRESHES = 2;

/**
 * Teto da fila de espera. Estourou, os pedidos excedentes são DESCARTADOS em
 * silêncio (não enfileirados para sempre): a próxima abertura da tela pede de
 * novo, e uma fila que cresce sem limite só adiaria trabalho que já não
 * interessa mais a ninguém.
 */
export const MAX_PENDING_AVATAR_REFRESHES = 500;

export interface ContactAvatarResult {
  contactJid: string;
  /** Ausente = não temos foto para mostrar (ou nunca checamos, ou checamos e não há). */
  avatarUrl?: string;
}

/**
 * Bloco B2 (issue #13) — serve as fotos de perfil das listas SEM nunca tocar
 * o socket Baileys no caminho da requisição.
 *
 * A leitura responde só com o que está em cache, sempre, na hora. O que
 * falta ou venceu vira trabalho de fundo, com teto de concorrência
 * (`MAX_CONCURRENT_AVATAR_REFRESHES`) e deduplicação por contato — quem
 * pediu não espera, e a próxima abertura da tela já encontra o resultado.
 *
 * É essa separação que permite devolver `fetchLive` às listas: antes, uma
 * lista com 50 linhas virava 50 consultas ao vivo no socket de envio (ADR
 * #78 e a correção de 2026-08-18); agora vira uma consulta ao Postgres.
 */
export class ContactAvatarService {
  private readonly queue: Array<{ tenantId: string; sessionName: string; contactJid: string }> = [];
  private readonly queued = new Set<string>();
  private active = 0;

  constructor(
    private readonly cache: ContactAvatarCacheRepository,
    private readonly source: ContactAvatarSource,
    private readonly logger: Logger,
    private readonly maxConcurrent: number = MAX_CONCURRENT_AVATAR_REFRESHES,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Fotos conhecidas dos contatos pedidos, em LOTE. Devolve imediatamente o
   * que há em cache (mesmo vencido — uma foto de uma semana atrás é melhor
   * que nenhuma) e agenda em segundo plano o que falta ou venceu.
   */
  async listAvatars(
    tenantId: string,
    sessionName: string,
    contactJids: string[],
  ): Promise<ContactAvatarResult[]> {
    const unique = [...new Set(contactJids)];
    if (unique.length === 0) return [];

    const records = await this.cache.findManyByContactJids(tenantId, sessionName, unique);
    const byJid = new Map(records.map((record) => [record.contactJid, record]));
    const now = this.now();

    for (const contactJid of unique) {
      if (isContactAvatarStale(byJid.get(contactJid), now)) {
        this.enqueueRefresh(tenantId, sessionName, contactJid);
      }
    }

    return unique.map((contactJid) => ({
      contactJid,
      avatarUrl: byJid.get(contactJid)?.avatarUrl,
    }));
  }

  /** Só para teste: quantos contatos ainda esperam atualização. */
  get pendingRefreshCount(): number {
    return this.queue.length;
  }

  private enqueueRefresh(tenantId: string, sessionName: string, contactJid: string): void {
    const key = `${tenantId}::${sessionName}::${contactJid}`;
    // Já na fila ou já sendo buscado: nada a fazer. Sem isto, uma tela que
    // recarrega a cada poll empilharia o mesmo contato dezenas de vezes.
    if (this.queued.has(key)) return;
    if (this.queue.length >= MAX_PENDING_AVATAR_REFRESHES) {
      this.logger.warn('Fila de atualização de fotos de perfil cheia — pedido descartado', {
        tenantId,
        sessionName,
      });
      return;
    }
    this.queued.add(key);
    this.queue.push({ tenantId, sessionName, contactJid });
    this.drain();
  }

  private drain(): void {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) return;
      this.active += 1;
      // Deliberadamente NÃO aguardado: este método é chamado de dentro de
      // `listAvatars`, e o ponto do bloco inteiro é a requisição não esperar
      // por nenhuma consulta ao WhatsApp.
      void this.refresh(job.tenantId, job.sessionName, job.contactJid).finally(() => {
        this.queued.delete(`${job.tenantId}::${job.sessionName}::${job.contactJid}`);
        this.active -= 1;
        this.drain();
      });
    }
  }

  private async refresh(tenantId: string, sessionName: string, contactJid: string): Promise<void> {
    try {
      const lookup = await this.source.lookup(tenantId, sessionName, contactJid);
      if (!lookup.checked) {
        // Não houve pergunta ao WhatsApp (a sessão não está de pé agora).
        // NÃO gravar é o ponto: um registro negativo aqui esconderia a foto
        // de todo mundo por horas logo depois de qualquer reinício. Sem
        // gravar, o próximo pedido tenta de novo.
        this.logger.debug('Foto de perfil não pôde ser consultada agora', {
          tenantId,
          sessionName,
          reason: lookup.reason,
        });
        return;
      }
      // Grava TAMBÉM quando não há foto: é o registro negativo que impede
      // este contato de ser reconsultado a cada abertura de tela.
      await this.cache.upsert(tenantId, sessionName, contactJid, lookup.avatarUrl, this.now());
    } catch (error) {
      // Cache auxiliar nunca derruba nada, e uma falha aqui não vira
      // registro negativo de propósito: sem gravar, o próximo pedido tenta
      // de novo, em vez de fingir por horas que o contato não tem foto.
      this.logger.debug('Falha ao atualizar a foto de perfil em cache', {
        tenantId,
        sessionName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
