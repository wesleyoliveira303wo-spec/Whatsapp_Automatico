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
export const MAX_CONCURRENT_AVATAR_REFRESHES = 1;

/**
 * Espera MÍNIMA entre duas consultas de foto — o gotejamento.
 *
 * Medido em 2026-09-05: o WhatsApp atende as primeiras consultas depois de
 * conectar e então PARA de responder (o próprio Baileys registra "timed out
 * waiting for message"); 20 consultas seguidas deram 20 timeouts. Não é
 * ausência de foto nem falta de paciência — é limitação do WhatsApp para
 * consulta de foto em lote. Esperar mais por cada uma não ajuda; pedir mais
 * devagar, sim.
 */
export const MIN_INTERVAL_BETWEEN_LOOKUPS_MS = 3_000;

/**
 * Timeouts seguidos que fazem a fila PAUSAR. Quando o WhatsApp começa a
 * calar, insistir só queima consultas e mantém o socket ocupado à toa —
 * melhor recuar e voltar depois.
 */
export const CONSECUTIVE_TIMEOUTS_TO_PAUSE = 5;

/** Quanto tempo a fila descansa depois de apanhar. */
export const PAUSE_AFTER_TIMEOUTS_MS = 10 * 60_000;

/** De quantas em quantas consultas o resumo de diagnóstico é publicado. */
const REPORT_EVERY_LOOKUPS = 10;

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
  /**
   * Contagem por desfecho desde o último resumo (instrumentação pedida pelo
   * fundador, 2026-09-05). Existe para responder com NÚMERO, e não com
   * hipótese, à pergunta "por que só algumas fotos aparecem?": quantas
   * realmente não têm foto, quantas não voltaram a tempo, quantas nem foram
   * perguntadas. Zerada a cada resumo.
   */
  private outcomes = { found: 0, absent: 0, timeout: 0, sessionNotLive: 0, failed: 0 };
  private consecutiveTimeouts = 0;
  private pausedUntil = 0;
  private lastLookupAt = 0;

  constructor(
    private readonly cache: ContactAvatarCacheRepository,
    private readonly source: ContactAvatarSource,
    private readonly logger: Logger,
    private readonly maxConcurrent: number = MAX_CONCURRENT_AVATAR_REFRESHES,
    private readonly now: () => Date = () => new Date(),
    /** Injetável só para teste — em produção é o gotejamento medido. */
    private readonly minIntervalMs: number = MIN_INTERVAL_BETWEEN_LOOKUPS_MS,
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

  /**
   * Puxa trabalho da fila respeitando três limites, todos vindos de medição
   * e não de estimativa (2026-09-05):
   *
   * - UMA consulta por vez (o socket é o mesmo das mensagens reais, ADR #78);
   * - um intervalo mínimo entre consultas — o WhatsApp para de responder
   *   quando as fotos são pedidas em rajada;
   * - uma pausa longa depois de vários timeouts seguidos: quando ele começa a
   *   calar, insistir só queima consultas.
   */
  private drain(): void {
    if (this.active >= this.maxConcurrent || this.queue.length === 0) return;

    const nowMs = this.now().getTime();
    if (nowMs < this.pausedUntil) return;

    const sinceLast = nowMs - this.lastLookupAt;
    if (sinceLast < this.minIntervalMs) {
      // Ainda cedo: reagenda em vez de descartar. Sem `unref` o processo
      // ficaria vivo por causa de um cache auxiliar — este timer nunca deve
      // segurar o encerramento da API.
      const timer = setTimeout(() => this.drain(), this.minIntervalMs - sinceLast);
      if (typeof timer.unref === 'function') timer.unref();
      return;
    }

    const job = this.queue.shift();
    if (!job) return;
    this.active += 1;
    this.lastLookupAt = nowMs;
    // Deliberadamente NÃO aguardado: este método é chamado de dentro de
    // `listAvatars`, e o ponto do bloco inteiro é a requisição não esperar
    // por nenhuma consulta ao WhatsApp.
    void this.refresh(job.tenantId, job.sessionName, job.contactJid).finally(() => {
      this.queued.delete(`${job.tenantId}::${job.sessionName}::${job.contactJid}`);
      this.active -= 1;
      this.drain();
    });
  }

  /**
   * Publica (e zera) a contagem por desfecho. É este log que responde "por
   * que só X fotos apareceram" com número em vez de suposição.
   */
  private maybeReportOutcomes(): void {
    const { found, absent, timeout, sessionNotLive, failed } = this.outcomes;
    const total = found + absent + timeout + sessionNotLive + failed;
    if (total === 0) return;
    // Um resumo a cada N consultas, não a cada fila vazia: com o gotejamento
    // (uma por vez, com intervalo) a fila quase nunca esvazia, e o resumo
    // anterior — que só saía nesse momento — praticamente nunca aparecia.
    if (total < REPORT_EVERY_LOOKUPS && this.queue.length > 0) return;
    this.outcomes = { found: 0, absent: 0, timeout: 0, sessionNotLive: 0, failed: 0 };
    this.logger.info('Atualização de fotos de perfil concluída', {
      total,
      // Encontrou a foto e guardou.
      comFoto: found,
      // Perguntou e o contato não tem foto (ou a privacidade bloqueia).
      semFoto: absent,
      // O WhatsApp não respondeu a tempo: NÃO é "sem foto", e por isso nada
      // foi guardado — o próximo pedido tenta de novo.
      semRespostaNoTempo: timeout,
      // Nem foi possível perguntar (sessão fora do ar neste instante).
      sessaoIndisponivel: sessionNotLive,
      // Erro inesperado ao guardar/consultar.
      falhas: failed,
    });
  }

  private async refresh(tenantId: string, sessionName: string, contactJid: string): Promise<void> {
    try {
      const lookup = await this.source.lookup(tenantId, sessionName, contactJid);
      if (!lookup.checked) {
        if (lookup.reason === 'timeout') {
          this.outcomes.timeout += 1;
          this.consecutiveTimeouts += 1;
          if (this.consecutiveTimeouts >= CONSECUTIVE_TIMEOUTS_TO_PAUSE) {
            // O WhatsApp parou de responder: recuar. Insistir agora só
            // ocuparia o socket sem trazer foto nenhuma.
            this.consecutiveTimeouts = 0;
            this.pausedUntil = this.now().getTime() + PAUSE_AFTER_TIMEOUTS_MS;
            this.logger.warn(
              'WhatsApp parou de responder consultas de foto — pausando a fila',
              { tenantId, sessionName, pausaMinutos: PAUSE_AFTER_TIMEOUTS_MS / 60_000 },
            );
          }
        } else {
          this.outcomes.sessionNotLive += 1;
        }
        this.maybeReportOutcomes();
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
      // Respondeu: a régua de "está calando" reinicia.
      this.consecutiveTimeouts = 0;
      if (lookup.avatarUrl) this.outcomes.found += 1;
      else this.outcomes.absent += 1;
      this.maybeReportOutcomes();
      // Grava TAMBÉM quando não há foto: é o registro negativo que impede
      // este contato de ser reconsultado a cada abertura de tela.
      await this.cache.upsert(tenantId, sessionName, contactJid, lookup.avatarUrl, this.now());
    } catch (error) {
      this.outcomes.failed += 1;
      this.maybeReportOutcomes();
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
