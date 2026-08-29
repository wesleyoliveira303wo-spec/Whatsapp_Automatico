import { Logger } from '../../../shared/domain/Logger';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import {
  Campaign,
  CampaignRecipientSummary,
  CampaignMetrics,
  CampaignSessionOverview,
  CampaignMediaContentType,
} from '../domain/entities/Campaign';
import { CampaignNotFoundError } from '../domain/errors/CampaignNotFoundError';
import { NoRecipientsSelectedError } from '../domain/errors/NoRecipientsSelectedError';
import { InvalidCampaignTransitionError } from '../domain/errors/InvalidCampaignTransitionError';
import { SendingEngineNotConfiguredError } from '../domain/errors/SendingEngineNotConfiguredError';
import { CampaignMediaTooLargeError } from '../domain/errors/CampaignMediaTooLargeError';
import { CampaignMediaTypeMismatchError } from '../domain/errors/CampaignMediaTypeMismatchError';
import { CampaignMediaNotFoundError } from '../domain/errors/CampaignMediaNotFoundError';
import {
  isDeclaredMediaCategoryImplausible,
  sniffMediaCategory,
} from '../../conversations/domain/mediaMagicBytes';
import { determineSkipReason } from '../domain/policies/determineSkipReason';
import { computeSendDelayMs } from '../domain/policies/computeSendDelayMs';
import {
  parseRecipientsCsv,
  RawPhoneRecipient,
  ParseRecipientsCsvResult,
} from '../domain/policies/recipientSources';
import { normalizePhoneToE164 } from '../../contacts/domain/phoneNumber';
import { CampaignSendDispatcher } from '../domain/dispatchers/CampaignSendDispatcher';
import { ContactLookup } from '../domain/ports/ContactLookup';
import {
  CampaignPage,
  CampaignRecipientDraft,
  CampaignRecipientPage,
  CampaignRepository,
  ListCampaignRecipientsOptions,
  ListCampaignsOptions,
} from '../domain/repositories/CampaignRepository';

/** Variação aleatória somada ao intervalo-base de cada envio (ver `computeSendDelayMs`) — mesmo espírito conservador do resto do motor de ritmo. */
const DEFAULT_JITTER_MAX_MS = 15_000;

/**
 * Teto de tamanho do anexo de campanha (Fase L, Bloco L8) — menor que
 * `MAX_AGENT_MEDIA_UPLOAD_BYTES` (16MB, `services/conversations`) de
 * propósito: aquele é UM envio para UMA pessoa; este binário fica em
 * Postgres e é relido a cada destinatário de uma campanha que pode ter
 * centenas deles — 5MB já é generoso para uma imagem/documento de
 * divulgação e mantém o custo de armazenamento/leitura previsível.
 */
export const MAX_CAMPAIGN_MEDIA_UPLOAD_BYTES = 5 * 1024 * 1024;

export interface CreateCampaignInput {
  tenantId: string;
  sessionName: string;
  name: string;
  description?: string;
  messageTemplate: string;
  /** Origem A: contatos salvos, selecionados na tela de Contatos. */
  contactIds: string[];
  /** Origens B (planilha, já parseada) + C (colados manualmente) — telefones brutos, ainda não normalizados. Opcional (default `[]`) — retrocompatível com quem só usa Origem A. */
  phoneRecipients?: RawPhoneRecipient[];
  createdByUserId?: string;
}

export interface CreateCampaignResult {
  campaign: Campaign;
  summary: CampaignRecipientSummary;
}

/**
 * Orquestra a criação de uma campanha e o cálculo (materialização) dos
 * destinatários — Fase L, Bloco L3.
 *
 * **Este serviço NUNCA envia nenhuma mensagem.** Ele só decide, para cada
 * contato selecionado, se entra (`pending`) ou é suprimido (`skipped` + um
 * motivo) — a mesma régua de três regras confirmada com o fundador (ver
 * docstring de `determineSkipReason`). O envio real é trabalho do L4/L5
 * (fila `campaign-send` + disjuntor de segurança), ainda não implementado.
 */
export class CampaignService {
  constructor(
    private readonly campaignRepository: CampaignRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly logger: Logger,
    /**
     * Fase L, Bloco L4 — OPCIONAL (mesmo padrão de `mediaSender` em
     * `ConversationsService`): ausente no modo degradado (sem `REDIS_URL`),
     * onde `campaignsRouter` continua montado para leitura/criação, mas o
     * motor de envio não existe. `startCampaign()` recusa com um erro claro
     * (`SendingEngineNotConfiguredError`) em vez de quebrar.
     */
    private campaignSendDispatcher?: CampaignSendDispatcher,
    /**
     * Reorganização Contatos/Campanhas (2026-08-17) — OPCIONAL (mesmo padrão
     * de `campaignSendDispatcher`): sem ele, telefones de planilha/lista
     * manual nunca são reconhecidos como Contatos já existentes, e viram
     * sempre destinatários "soltos" (`phoneE164`/`name`, sem `contactId`) —
     * degrada, nunca quebra.
     */
    private readonly contactLookup?: ContactLookup,
  ) {}

  /** Injeção tardia (Fase L, Bloco L4) — mesmo motivo/mesmo padrão de `ConversationsService.setMediaSender`: só existe depois que `WhatsAppConnectionRegistry` é montado, numa etapa posterior da composição em `index.ts`. */
  setCampaignSendDispatcher(dispatcher: CampaignSendDispatcher): void {
    this.campaignSendDispatcher = dispatcher;
  }

  /**
   * Parseia (sem persistir nada) o texto cru de uma planilha `.csv` de
   * destinatários — Reorganização Contatos/Campanhas (2026-08-17), "Seção 2 —
   * Destinatários" da tela de criação. A UI mantém o resultado em memória e
   * manda `recipients` de volta dentro de `createCampaign` — não existe
   * "rascunho" de campanha persistido no servidor entre os dois passos.
   */
  parseRecipientsCsv(csvText: string): ParseRecipientsCsvResult {
    return parseRecipientsCsv(csvText);
  }

  /**
   * Cria a campanha e materializa os destinatários — Fase L, Bloco L3,
   * reorganizado em 2026-08-17 para aceitar três origens combináveis:
   *
   * (A) `contactIds` — Contatos já salvos no CRM, selecionados na tela.
   * (B)+(C) `phoneRecipients` — planilha (já parseada por `parseRecipientsCsv`)
   * e/ou números colados manualmente, como uma lista só de `{rawPhone, name?}`
   * (a UI já combinou as duas antes de mandar).
   *
   * Um telefone de (B)/(C) que JÁ corresponde a um Contato existente
   * (`contactLookup`) é tratado exatamente como se tivesse vindo de (A) — a
   * campanha nunca cria dois destinatários para a mesma pessoa. Só telefones
   * genuinamente novos (sem Contato) viram um destinatário "solto"
   * (`phoneE164`/`name`, sem `contactId`) — **isto nunca cria um
   * `WhatsAppContact`**: a planilha alimenta só esta campanha.
   */
  async createCampaign(input: CreateCampaignInput): Promise<CreateCampaignResult> {
    await this.assertTenantExists(input.tenantId);

    // Dedup defensivo: a UI já evita ids repetidos (é um `Set` de seleção),
    // mas um cliente HTTP direto poderia mandar a mesma lista duas vezes —
    // sem isso, `createRecipients` colidiria consigo mesma no lote.
    const contactIds = new Set(input.contactIds);

    // Normaliza + dedup dos telefones brutos (planilha + manual, já
    // combinados pela UI). A PRIMEIRA ocorrência de um telefone vale — mesma
    // regra de `mapImportRows`. Entradas que não normalizam são
    // silenciosamente descartadas aqui: a UI já validou/mostrou isso ao
    // operador na prévia (Seção 2/Seção 4); um cliente HTTP direto mandando
    // lixo não deveria derrubar a criação inteira.
    const phoneToName = new Map<string, string | undefined>();
    const phoneToPersonalizedMessage = new Map<string, string | undefined>();
    for (const recipient of input.phoneRecipients ?? []) {
      const phoneE164 = normalizePhoneToE164(recipient.rawPhone);
      if (!phoneE164 || phoneToName.has(phoneE164)) continue;
      phoneToName.set(phoneE164, recipient.name);
      phoneToPersonalizedMessage.set(phoneE164, recipient.personalizedMessage);
    }

    // Telefones que já são um Contato conhecido "viram" origem (A) — nunca
    // dois destinatários para a mesma pessoa, nunca um Contato novo criado.
    const phones = Array.from(phoneToName.keys());
    const resolvedContactIds =
      phones.length > 0 && this.contactLookup
        ? await this.contactLookup.findContactIdsByPhones(input.tenantId, phones)
        : new Map<string, string>();

    const looseRecipients: { phoneE164: string; name?: string }[] = [];
    const contactPersonalizedMessages = new Map<string, string>();
    for (const phone of phones) {
      const existingContactId = resolvedContactIds.get(phone);
      if (existingContactId) {
        contactIds.add(existingContactId);
        const personalizedMessage = phoneToPersonalizedMessage.get(phone);
        if (personalizedMessage) {
          contactPersonalizedMessages.set(existingContactId, personalizedMessage);
        }
      } else {
        looseRecipients.push({ phoneE164: phone, name: phoneToName.get(phone) });
      }
    }

    const contactIdList = Array.from(contactIds);
    if (contactIdList.length === 0 && looseRecipients.length === 0) {
      throw new NoRecipientsSelectedError();
    }

    const campaign = await this.campaignRepository.create({
      tenantId: input.tenantId,
      sessionName: input.sessionName,
      name: input.name,
      description: input.description,
      messageTemplate: input.messageTemplate,
      createdByUserId: input.createdByUserId,
    });

    const eligibilityByContactId =
      contactIdList.length > 0
        ? await this.campaignRepository.fetchEligibility(
            input.tenantId,
            input.sessionName,
            contactIdList,
          )
        : new Map();

    const contactDrafts: CampaignRecipientDraft[] = contactIdList
      // Um `contactId` que não existe mais/não pertence ao tenant simplesmente
      // não aparece no mapa de elegibilidade — ignorado aqui, nunca vira uma
      // linha "fantasma" de destinatário.
      .filter((contactId) => eligibilityByContactId.has(contactId))
      .map((contactId) => {
        const eligibility = eligibilityByContactId.get(contactId)!;
        const skipReason = determineSkipReason(eligibility);
        const personalizedMessage = contactPersonalizedMessages.get(contactId);
        return skipReason
          ? { contactId, status: 'skipped' as const, skipReason }
          : { contactId, status: 'pending' as const, personalizedMessage };
      });

    // Destinatários sem Contato nunca têm como ser checados contra opt-out/
    // conversa ativa/recontato (essas regras vivem no Contato) — nascem
    // sempre `pending`. Isso é aceitável: sem Contato, não há histórico
    // nenhum com essa pessoa ainda.
    const looseDrafts: CampaignRecipientDraft[] = looseRecipients.map((recipient) => ({
      phoneE164: recipient.phoneE164,
      name: recipient.name,
      personalizedMessage: phoneToPersonalizedMessage.get(recipient.phoneE164),
      status: 'pending' as const,
    }));

    const drafts = [...contactDrafts, ...looseDrafts];
    await this.campaignRepository.createRecipients(input.tenantId, campaign.id, drafts);

    const summary = await this.campaignRepository.summarizeRecipients(input.tenantId, campaign.id);

    this.logger.info('Campanha criada e destinatários calculados', {
      tenantId: input.tenantId,
      campaignId: campaign.id,
      sessionName: input.sessionName,
      total: summary.total,
      pending: summary.pending,
      skipped: summary.skipped,
      looseRecipients: looseDrafts.length,
    });

    return { campaign, summary };
  }

  async listCampaigns(tenantId: string, options: ListCampaignsOptions): Promise<CampaignPage> {
    await this.assertTenantExists(tenantId);
    return this.campaignRepository.listByTenant(tenantId, options);
  }

  /** Cards do topo + donut "Status das campanhas" da tela de Campanhas (retrofit visual 2026-08-18). */
  async getSessionOverview(
    tenantId: string,
    sessionName: string,
  ): Promise<CampaignSessionOverview> {
    await this.assertTenantExists(tenantId);
    return this.campaignRepository.getSessionOverview(tenantId, sessionName);
  }

  async getCampaign(
    tenantId: string,
    campaignId: string,
  ): Promise<{ campaign: Campaign; summary: CampaignRecipientSummary }> {
    await this.assertTenantExists(tenantId);
    const campaign = await this.campaignRepository.findById(tenantId, campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError(campaignId);
    }
    const summary = await this.campaignRepository.summarizeRecipients(tenantId, campaignId);
    return { campaign, summary };
  }

  /**
   * Métricas de campanha (Fase L, Bloco L7) — o funil real além de
   * "mensagens enviadas": resposta, estágio no Pipeline, custo de IA e
   * conversão. Lança `CampaignNotFoundError` nas mesmas condições de
   * `getCampaign`.
   */
  async getCampaignMetrics(tenantId: string, campaignId: string): Promise<CampaignMetrics> {
    await this.assertTenantExists(tenantId);
    const metrics = await this.campaignRepository.getMetrics(tenantId, campaignId);
    if (!metrics) {
      throw new CampaignNotFoundError(campaignId);
    }
    return metrics;
  }

  async listRecipients(
    tenantId: string,
    campaignId: string,
    options: ListCampaignRecipientsOptions,
  ): Promise<CampaignRecipientPage> {
    await this.assertTenantExists(tenantId);
    const campaign = await this.campaignRepository.findById(tenantId, campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError(campaignId);
    }
    return this.campaignRepository.listRecipients(tenantId, campaignId, options);
  }

  /**
   * Inicia (ou RETOMA, após pausa) uma campanha — Fase L, Bloco L4. Só
   * `draft`/`paused` podem virar `running`; qualquer outro status lança
   * `InvalidCampaignTransitionError`.
   *
   * Reagenda TODOS os destinatários ainda `PENDING` (não só os nunca
   * tentados) com um delay FRESCO, calculado a partir de AGORA — nunca do
   * `n` original de quando a campanha nasceu. É isto que torna retomar uma
   * campanha pausada seguro sem lógica extra: um job cujo horário chegou
   * enquanto a campanha estava pausada já rodou, viu `status !== 'running'`
   * e terminou sem enviar (removendo o `jobId`, ver `CampaignSendJobProcessor`)
   * — o destinatário ficou `PENDING`, órfão de qualquer job futuro, até este
   * método rodar de novo e reagendá-lo.
   */
  async startCampaign(tenantId: string, campaignId: string): Promise<Campaign> {
    await this.assertTenantExists(tenantId);
    if (!this.campaignSendDispatcher) {
      throw new SendingEngineNotConfiguredError();
    }

    const campaign = await this.campaignRepository.findById(tenantId, campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError(campaignId);
    }
    if (campaign.status !== 'draft' && campaign.status !== 'paused') {
      throw new InvalidCampaignTransitionError(campaign.status, 'start');
    }

    return this.scheduleAllPending(tenantId, campaignId, campaign, 'Campanha iniciada/retomada');
  }

  /**
   * Reabre uma campanha `completed`/`cancelled` — retrofit 2026-08-18 (pedido
   * do fundador: "não existe nenhum botão onde podemos reiniciar ou refazer
   * uma campanha"). Achado real que motivou o pedido: destinatários que
   * falharam por um problema TRANSITÓRIO (ex.: a sessão do WhatsApp
   * reconectando bem na hora do envio — a mesma classe de bug corrigida nesta
   * mesma rodada em `whatsapp-outbound`, ver `createConversationsComposition`)
   * ficavam `FAILED` para sempre, sem nenhum caminho de retentativa assim que
   * a campanha chegava a `completed`.
   *
   * Primeiro devolve todo destinatário `FAILED` para `PENDING`
   * (`resetFailedRecipientsToPending` — NUNCA mexe em `SKIPPED`, ver a
   * docstring do método no port: reabrir não pode ser um jeito indireto de
   * burlar opt-out/conversa ativa/limite de 7 dias) e então reusa o MESMO
   * agendamento de `startCampaign` sobre todo `PENDING` resultante (os que já
   * estavam pendentes + os recém-resetados).
   */
  async reopenCampaign(tenantId: string, campaignId: string): Promise<Campaign> {
    await this.assertTenantExists(tenantId);
    if (!this.campaignSendDispatcher) {
      throw new SendingEngineNotConfiguredError();
    }

    const campaign = await this.campaignRepository.findById(tenantId, campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError(campaignId);
    }
    if (campaign.status !== 'completed' && campaign.status !== 'cancelled') {
      throw new InvalidCampaignTransitionError(campaign.status, 'reopen');
    }

    const resetCount = await this.campaignRepository.resetFailedRecipientsToPending(
      tenantId,
      campaignId,
    );
    this.logger.info('Campanha reaberta: destinatários com falha devolvidos a pendente', {
      tenantId,
      campaignId,
      resetCount,
    });

    return this.scheduleAllPending(tenantId, campaignId, campaign, 'Campanha reaberta');
  }

  /**
   * Agenda todo destinatário `PENDING` desta campanha com delay FRESCO
   * (calculado a partir de AGORA, nunca do `n` original) e move para
   * `running` — núcleo compartilhado por `startCampaign`/`reopenCampaign`.
   * Sem nenhum `PENDING` (ex.: todos suprimidos na materialização, ou uma
   * reabertura sem nenhum `FAILED` a resetar), a campanha vai direto para
   * `completed` em vez de `running`.
   */
  private async scheduleAllPending(
    tenantId: string,
    campaignId: string,
    campaign: Campaign,
    logMessage: string,
  ): Promise<Campaign> {
    const pendingRecipients = await this.campaignRepository.listPendingRecipients(
      tenantId,
      campaignId,
    );

    if (pendingRecipients.length === 0) {
      const completed = await this.campaignRepository.updateCampaignStatus(
        tenantId,
        campaignId,
        'completed',
      );
      return completed!;
    }

    const now = new Date();
    await Promise.all(
      pendingRecipients.map((recipient, index) => {
        const delayMs = computeSendDelayMs(index, {
          intervalBaseMs: campaign.intervalSeconds * 1000,
          jitterMaxMs: DEFAULT_JITTER_MAX_MS,
          sendWindowStart: campaign.sendWindowStart,
          sendWindowEnd: campaign.sendWindowEnd,
          now,
        });
        return this.campaignSendDispatcher!.scheduleRecipient(
          tenantId,
          campaignId,
          recipient.id,
          delayMs,
        );
      }),
    );

    const updated = await this.campaignRepository.updateCampaignStatus(
      tenantId,
      campaignId,
      'running',
    );
    this.logger.info(logMessage, {
      tenantId,
      campaignId,
      recipientsScheduled: pendingRecipients.length,
    });
    return updated!;
  }

  /**
   * Pausa uma campanha em execução — Fase L, Bloco L4. Não toca a fila (ver
   * docstring de `CampaignSendDispatcher`): jobs já agendados disparam
   * normalmente no horário, olham `status`, e não fazem nada.
   */
  async pauseCampaign(tenantId: string, campaignId: string): Promise<Campaign> {
    await this.assertTenantExists(tenantId);
    const campaign = await this.campaignRepository.findById(tenantId, campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError(campaignId);
    }
    if (campaign.status !== 'running') {
      throw new InvalidCampaignTransitionError(campaign.status, 'pause');
    }
    const updated = await this.campaignRepository.updateCampaignStatus(
      tenantId,
      campaignId,
      'paused',
      'paused_manually',
    );
    this.logger.info('Campanha pausada manualmente', { tenantId, campaignId });
    return updated!;
  }

  /**
   * Cancela uma campanha (terminal — não pode ser retomada). Permitido a
   * partir de qualquer status ainda não terminal (`draft`/`running`/`paused`).
   */
  async cancelCampaign(tenantId: string, campaignId: string): Promise<Campaign> {
    await this.assertTenantExists(tenantId);
    const campaign = await this.campaignRepository.findById(tenantId, campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError(campaignId);
    }
    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      throw new InvalidCampaignTransitionError(campaign.status, 'cancel');
    }
    const updated = await this.campaignRepository.updateCampaignStatus(
      tenantId,
      campaignId,
      'cancelled',
    );
    this.logger.info('Campanha cancelada', { tenantId, campaignId });
    return updated!;
  }

  /**
   * Remove a campanha definitivamente — retrofit visual 2026-08-18 (menu
   * "⋮" da lista, pedido do fundador). Recusa apagar uma campanha `running`
   * (precisa pausar/cancelar antes) — mensagens já em voo continuam sendo
   * processadas normalmente pelo `CampaignSendJobProcessor` mesmo que a
   * campanha suma no meio do caminho (ele já relê `status` a cada job e
   * simplesmente não faz nada se não achar mais a campanha), mas apagar uma
   * campanha ATIVA sem essa recusa seria uma armadilha de UX — o operador
   * perderia o painel de acompanhamento de um envio em andamento sem
   * querer.
   */
  async deleteCampaign(tenantId: string, campaignId: string): Promise<void> {
    await this.assertTenantExists(tenantId);
    const campaign = await this.campaignRepository.findById(tenantId, campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError(campaignId);
    }
    if (campaign.status === 'running') {
      throw new InvalidCampaignTransitionError(campaign.status, 'delete');
    }
    await this.campaignRepository.deleteById(tenantId, campaignId);
    this.logger.info('Campanha excluída', { tenantId, campaignId });
  }

  /**
   * Anexa (ou substitui) a mídia de uma campanha — Fase L, Bloco L8. Só
   * `draft` pode ter mídia anexada/trocada (mesma régua de `deleteCampanha`:
   * uma campanha já iniciada não pode ter seu conteúdo mudado no meio do
   * envio — destinatários já contatados receberiam uma coisa, os seguintes
   * outra). Mesma checagem de tamanho/assinatura binária já usada por
   * `ConversationsService.sendAgentMediaMessage` (F1.3/F1.10).
   */
  async attachCampaignMedia(
    tenantId: string,
    campaignId: string,
    media: {
      contentType: CampaignMediaContentType;
      buffer: Buffer;
      mimeType: string;
      fileName?: string;
    },
  ): Promise<Campaign> {
    await this.assertTenantExists(tenantId);
    const campaign = await this.campaignRepository.findById(tenantId, campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError(campaignId);
    }
    if (campaign.status !== 'draft') {
      throw new InvalidCampaignTransitionError(campaign.status, 'attach_media');
    }
    if (media.buffer.byteLength > MAX_CAMPAIGN_MEDIA_UPLOAD_BYTES) {
      throw new CampaignMediaTooLargeError(
        media.buffer.byteLength,
        MAX_CAMPAIGN_MEDIA_UPLOAD_BYTES,
      );
    }
    if (isDeclaredMediaCategoryImplausible(media.contentType, media.buffer)) {
      const detected = sniffMediaCategory(media.buffer) ?? 'desconhecida';
      throw new CampaignMediaTypeMismatchError(media.contentType, detected);
    }

    const updated = await this.campaignRepository.attachMedia(tenantId, campaignId, media);
    this.logger.info('Mídia anexada à campanha', {
      tenantId,
      campaignId,
      contentType: media.contentType,
      bytes: media.buffer.byteLength,
    });
    return updated!;
  }

  /** Remove a mídia anexada — mesma régua de `attachCampaignMedia` (só `draft`). No-op silencioso se a campanha não tinha nenhuma mídia. */
  async removeCampaignMedia(tenantId: string, campaignId: string): Promise<Campaign> {
    await this.assertTenantExists(tenantId);
    const campaign = await this.campaignRepository.findById(tenantId, campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError(campaignId);
    }
    if (campaign.status !== 'draft') {
      throw new InvalidCampaignTransitionError(campaign.status, 'attach_media');
    }

    const updated = await this.campaignRepository.removeMedia(tenantId, campaignId);
    this.logger.info('Mídia removida da campanha', { tenantId, campaignId });
    return updated!;
  }

  /** Binário da mídia anexada — usado pela rota de download/preview (`GET .../campaigns/:id/media`). */
  async getCampaignMedia(
    tenantId: string,
    campaignId: string,
  ): Promise<{
    contentType: CampaignMediaContentType;
    buffer: Buffer;
    mimeType: string;
    fileName?: string;
  }> {
    await this.assertTenantExists(tenantId);
    const media = await this.campaignRepository.getMediaContent(tenantId, campaignId);
    if (!media) {
      throw new CampaignMediaNotFoundError(campaignId);
    }
    return media;
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      this.logger.warn('Operação de campanha recusada: tenant inexistente', { tenantId });
      throw new TenantNotFoundError(tenantId);
    }
  }
}
