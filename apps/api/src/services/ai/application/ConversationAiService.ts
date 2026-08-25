import { Message } from '../../conversations/domain/entities/Message';
import { MessageRepository } from '../../conversations/domain/repositories/MessageRepository';
import { MediaDownloader } from '../../whatsapp/domain/providers/MediaDownloader';
import { AiInteraction } from '../domain/entities/AiInteraction';
import { AiInteractionRepository } from '../domain/repositories/AiInteractionRepository';
import { AiBusinessProfileRepository } from '../domain/repositories/AiBusinessProfileRepository';
import { CampaignOriginResolver } from '../domain/repositories/CampaignOriginResolver';
import { buildCampaignContext } from '../domain/campaignContext';
import { calculateCostUsd } from '../domain/AiPricing';
import { PromptVersion } from '../domain/PromptVersion';
import { AiGenerationResult, AiMediaContentPart } from '../domain/providers/AiProvider';
import { AiProviderFactory } from '../domain/providers/AiProviderFactory';
import { AiProviderName } from '../domain/providers/AiProviderName';
import { validateReply } from '../domain/ReplyValidator';
import { extractEscalation, EscalationReason } from '../domain/escalationSignal';
import { extractStage, StageSignalValue } from '../domain/stageSignal';
import { extractAudioTranscript } from '../domain/audioTranscriptSignal';
import { extractImageDescription } from '../domain/imageDescriptionSignal';
import { getOffHoursContext } from '../domain/workingHours';
import { PromptBuilder } from './PromptBuilder';

/**
 * Teto de tamanho (em bytes) de mídia enviada à IA multimodal (Fase 1,
 * Bloco F1.2) — protege contra custo/latência desproporcionais de um
 * arquivo grande (ex.: um vídeo ou documento de várias dezenas de MB). Acima
 * deste limite, a mídia é tratada como "não anexável" (mesmo efeito de
 * download falho): a IA ainda vê a descrição factual de
 * `PromptBuilder.describeMessageContent`, só não recebe o binário. Valor
 * conservador — a maioria de fotos/áudios de WhatsApp fica bem abaixo disso;
 * revisar com dados reais de uso do beta se necessário.
 */
const MAX_MEDIA_BYTES_FOR_AI = 10 * 1024 * 1024;

/**
 * Resultado devolvido por `ConversationAiService.generateReply()`. Os
 * valores de `status` reutilizam deliberadamente os mesmos literais já
 * definidos para `AiInteraction.status` (Domain,
 * `services/ai/domain/entities/AiInteraction.ts`) — os dois tipos
 * permanecem distintos (este é o resultado devolvido a quem chamou;
 * `AiInteraction` é o registro persistido), mas usam o mesmo vocabulário de
 * propósito, evitando uma conversão de nomes só por formalidade.
 *
 * `'timeout'` não é produzido por este serviço: `ClaudeAiProvider` não
 * distingue timeout de outros erros de rede/API — qualquer falha do
 * provider vira `'provider_error'` aqui. Diferenciar timeout exigiria uma
 * decisão de design (tipo de erro dedicado, ou timeout imposto por este
 * serviço) que nenhum critério de aceite pede até agora; fica como possível
 * refinamento do Bloco 4, não implementado agora (YAGNI).
 *
 * `aiInteractionId` (Bloco 4): presente SÓ no caminho `'success'` — é o `id`
 * devolvido por `AiInteractionRepository.record()` (achado F2, aprovado
 * antes deste bloco: `record()` passou a devolver `Promise<string>` em vez
 * de `Promise<void>`, mas até aqui nenhum chamador de produção usava esse
 * retorno). O worker de IA (`apps/api/src/worker.ts`, Bloco 4) precisa dele
 * para montar o `OutboundMessageCommand` (`aiInteractionId` é a chave de
 * idempotência do envio, decisão D2, e o valor que
 * `AiInteractionRepository.linkMessage()` usa depois do envio, decisão D3).
 * Não incluído em `'validation_rejected'`/`'provider_error'`: nenhum desses
 * dois caminhos gera um envio outbound, então não há necessidade de
 * referenciar a interação depois.
 */
export type ConversationAiResult =
  | {
      status: 'success';
      content: string;
      model: string;
      tokensInput: number;
      tokensOutput: number;
      aiInteractionId: string;
      /**
       * Feature N2 (auto-escalonamento), estendida na Fase 1/Bloco F1.4
       * (2026-08-01): presente quando a IA emitiu um marcador de
       * escalonamento — `content` já vem SEM o marcador (o cliente nunca o
       * vê). `'unknown_answer'` = a IA não sabia responder (lacuna real de
       * conteúdo); `'requested_human'` = o cliente pediu para falar com uma
       * pessoa (preferência, não lacuna). `undefined` = não escalou. Quem
       * consome (`AiReplyJobProcessor`) envia a mensagem e, se presente,
       * sinaliza a conversa como precisando de atenção humana.
       */
      escalationReason?: EscalationReason;
      /**
       * Pipeline de CRM (Milestone 6, Bloco M6H-5, 2026-07-30): estágio de
       * funil que a IA sugere para esta conversa, extraído do marcador
       * `[[ESTAGIO:...]]` (`content` já vem SEM o marcador). `undefined`
       * quando a IA não incluiu o marcador ou incluiu um valor não
       * reconhecido — quem consome (`AiReplyJobProcessor`) trata isso como
       * "sem sugestão", nunca como erro (degradação graciosa, mesmo
       * espírito de `escalate`).
       */
      suggestedStage?: StageSignalValue;
    }
  | { status: 'validation_rejected'; reason: string }
  | { status: 'provider_error'; errorMessage: string };

const DEFAULT_MAX_REPLY_LENGTH = 4096;

/**
 * Orquestra a geração de uma resposta de IA para uma conversa e grava o
 * registro de auditoria/billing correspondente — Milestone 3, Bloco 3b.
 *
 * Fluxo de `generateReply()`: `PromptBuilder.build()` → resolve o
 * `AiProvider` via `AiProviderFactory.create(providerName)` →
 * `AiProvider.generateReply()` → `validateReply()` → grava `AiInteraction`
 * via `AiInteractionRepository.record()`. Não conhece Anthropic SDK, HTTP,
 * `fetch`/`axios`, BullMQ ou Prisma — só os colaboradores injetados no
 * construtor e as funções puras `validateReply`/`calculateCostUsd`.
 *
 * DECISÃO A1 (levantamento arquitetural do Bloco 3b, confirmada pelo
 * usuário): este serviço continua RECEBENDO `messages`/`promptVersion` já
 * prontos, em vez de buscar o histórico sozinho — `MessageRepository`
 * (Bloco 2) só tem `create()`, nenhum método de leitura ainda, e adicionar
 * um agora não teria nenhum chamador de produção neste bloco (YAGNI). Quem
 * busca o histórico é responsabilidade de quem chama `generateReply()` —
 * nos testes deste bloco, e a partir do Bloco 4, o worker de IA. Ganhou só
 * `tenantId`/`conversationId` como parâmetros novos, necessários para
 * montar o `AiInteraction`.
 *
 * GRAVAÇÃO DE AUDITORIA (`recordInteraction`, privado): acontece em TODA
 * tentativa (sucesso, validação rejeitada, erro do provider) — critério de
 * aceite `MILESTONE_003_AI_AUTORESPONDER.md` §6. Ao contrário da geração em
 * si (que nunca lança — erros do provider viram `'provider_error'` no
 * retorno), uma falha em `aiInteractionRepository.record()` PROPAGA: este
 * bloco não é chamado por nenhum caminho de produção ainda (sem fila,
 * "SEM fila — ConversationAiService é chamado direto nos testes deste
 * bloco", §3), então não há UX de usuário final a proteger de uma falha de
 * persistência agora — engolir essa falha silenciosamente esconderia uma
 * lacuna de billing sem nenhum Logger para alertar (fora do escopo
 * aprovado deste bloco). Resiliência de persistência (retry, dead-letter)
 * é responsabilidade da infraestrutura de fila do Bloco 4, não deste
 * serviço — decisão deliberada, não uma omissão.
 *
 * `messageId` (Fase 1, Bloco F1.4, 2026-08-01): quando o chamador informa o
 * `id` da mensagem INBOUND que originou a chamada (5º parâmetro de
 * `generateReply`), ele é gravado em `AiInteraction.messageId` em TODA
 * tentativa (sucesso ou falha) — é a pergunta que a IA tentou responder,
 * mesmo quando não conseguiu. Antes deste bloco, o campo ficava sempre
 * `undefined` aqui (só existia preparado para uma vinculação futura via
 * `linkMessage`, nunca chamada). `model` fica `undefined` no caminho
 * `'provider_error'` — a chamada falhou antes de qualquer resposta (e
 * portanto de qualquer `model` real) chegar.
 *
 * IDEMPOTÊNCIA/DEDUPLICAÇÃO — NÃO é responsabilidade deste serviço (achado
 * F1, aprovado para preparação arquitetural, sem mudança de comportamento):
 * `generateReply()` não verifica, nem aqui nem em `recordInteraction()`, se
 * a mensagem/conversa recebida já foi processada antes — cada chamada
 * incondicionalmente gera uma nova tentativa e grava um novo `AiInteraction`.
 * Isso é deliberado: hoje (Bloco 3b) não existe fila nenhuma, então não há
 * reprocessamento a evitar. A partir do Bloco 4, quando `AiReplyScheduler`
 * (`services/conversations/domain/schedulers/AiReplyScheduler.ts`) for
 * implementado via BullMQ e um job puder ser reentregue (retry, at-least-once
 * delivery), a responsabilidade de detectar/evitar duplicidade — por
 * exemplo, via uma chave de idempotência derivada de
 * `tenantId`+`conversationId`+`messageId` — é do WORKER que consome a fila
 * `ai-reply`, ANTES de chamar `ConversationAiService.generateReply()`, não
 * deste serviço. `ConversationAiService` permanece uma função de orquestração
 * pura em relação a chamadas repetidas (mesma entrada, mesmo efeito de novo
 * registro) — nenhum estado de "já processado" é mantido aqui, por design:
 * introduzir isso agora seria antecipar uma decisão que só faz sentido
 * junto do mecanismo de fila real (Bloco 4), incluindo escolher ONDE a
 * chave de idempotência é checada (produtor vs. consumidor do BullMQ) e
 * COMO ela é persistida — nenhuma dessas decisões foi tomada ainda.
 */
export class ConversationAiService {
  constructor(
    private readonly aiProviderFactory: AiProviderFactory,
    private readonly providerName: AiProviderName,
    private readonly promptBuilder: PromptBuilder,
    private readonly aiInteractionRepository: AiInteractionRepository,
    private readonly maxReplyLength: number = DEFAULT_MAX_REPLY_LENGTH,
    private readonly aiBusinessProfileRepository?: AiBusinessProfileRepository,
    /**
     * Fase 1, Bloco F1.2 (interpretação de mídia pela IA). OPCIONAL, mesmo
     * padrão de `aiBusinessProfileRepository`: sem ele configurado, o
     * comportamento é idêntico ao de antes deste bloco (a IA só recebe a
     * descrição factual de `PromptBuilder.describeMessageContent`, nunca o
     * binário). Port de `services/whatsapp/domain` — mesmo papel estrutural
     * de `MediaDownloader` já usado por `ConversationsService` (proxy de
     * exibição na Dashboard); aqui o consumo é para dar VISÃO/AUDIÇÃO real à
     * IA, não para servir um binário a um humano.
     */
    private readonly mediaDownloader?: MediaDownloader,
    /**
     * Fase L, Bloco L6 — OPCIONAL, mesmo padrão de `mediaDownloader`: sem
     * ele configurado, o comportamento é idêntico ao de antes deste bloco
     * (nenhuma conversa recebe o bloco de contexto de campanha).
     */
    private readonly campaignOriginResolver?: CampaignOriginResolver,
    /**
     * Features de transcrição de áudio / descrição de imagem (2026-08-24).
     * OPCIONAL, mesmo padrão de `mediaDownloader`/`campaignOriginResolver`:
     * sem ele configurado, a IA ainda "ouve"/"vê" o anexo desta chamada
     * (comportamento de F1.2 inalterado), só não persiste a transcrição/
     * descrição — degrada para o comportamento de antes destas features,
     * nunca quebra a resposta.
     */
    private readonly messageRepository?: MessageRepository,
  ) {}

  async generateReply(
    tenantId: string,
    conversationId: string,
    messages: Message[],
    promptVersion: PromptVersion,
    sessionName: string,
    /**
     * Fase 1, Bloco F1.4 (2026-08-01) — `id` da `Message` INBOUND que
     * originou esta geração (a pergunta do cliente). Opcional por
     * compatibilidade com os testes/chamadores existentes que não o
     * informam; `AiReplyJobProcessor` (único chamador de produção) sempre o
     * passa (`AiReplyJobData.messageId`). Gravado em TODA tentativa
     * (`AiInteraction.messageId`), sucesso ou falha — é precisamente a
     * pergunta que a IA tentou responder, mesmo quando não conseguiu.
     */
    messageId?: string,
  ): Promise<ConversationAiResult> {
    const { businessContext, offHoursContext } = await this.loadProfileContext(
      tenantId,
      sessionName,
    );
    const mediaByMessageId = await this.loadLatestInboundMedia(tenantId, sessionName, messages);
    const campaignContext = await this.loadCampaignContext(tenantId, conversationId);
    const request = this.promptBuilder.build(
      messages,
      promptVersion,
      businessContext,
      mediaByMessageId,
      offHoursContext,
      campaignContext,
    );
    const startedAt = Date.now();

    let generationResult: AiGenerationResult;
    try {
      const provider = this.aiProviderFactory.create(this.providerName);
      generationResult = await provider.generateReply(request);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.recordInteraction({
        tenantId,
        conversationId,
        messageId,
        promptVersionId: promptVersion.id,
        model: undefined,
        tokensInput: 0,
        tokensOutput: 0,
        latencyMs: Date.now() - startedAt,
        status: 'provider_error',
        errorMessage,
      });
      return { status: 'provider_error', errorMessage };
    }

    const latencyMs = Date.now() - startedAt;
    // Feature N2: extrai o marcador de escalonamento ANTES de validar/enviar —
    // o cliente nunca recebe o marcador, e a validação de tamanho corre sobre o
    // texto já limpo.
    const { escalationReason, content: contentWithoutEscalation } = extractEscalation(
      generationResult.content,
    );
    // Pipeline de CRM (M6H-5): mesmo ponto do pipeline, encadeado — extrai o
    // marcador de estágio do texto JÁ SEM o marcador de escalonamento (a
    // ordem entre os dois marcadores na resposta da IA não importa, cada
    // extração só procura o seu próprio marcador).
    const { stage: suggestedStage, content: contentWithoutStage } =
      extractStage(contentWithoutEscalation);
    // Feature de transcrição de áudio (2026-08-24): mesmo encadeamento —
    // extrai o marcador de transcrição do texto já sem os dois anteriores.
    const { transcript: audioTranscript, content: contentWithoutTranscript } =
      extractAudioTranscript(contentWithoutStage);
    // Feature de descrição de imagem (2026-08-24): mesmo encadeamento —
    // extrai o marcador de descrição do texto já sem os três anteriores.
    const { description: imageDescription, content: cleanedContent } =
      extractImageDescription(contentWithoutTranscript);
    const validation = validateReply(cleanedContent, this.maxReplyLength);

    if (!validation.valid) {
      await this.recordInteraction({
        tenantId,
        conversationId,
        messageId,
        promptVersionId: promptVersion.id,
        model: generationResult.model,
        tokensInput: generationResult.tokensInput,
        tokensOutput: generationResult.tokensOutput,
        latencyMs,
        status: 'validation_rejected',
        errorMessage: validation.reason,
      });
      return { status: 'validation_rejected', reason: validation.reason };
    }

    const aiInteractionId = await this.recordInteraction({
      tenantId,
      conversationId,
      messageId,
      promptVersionId: promptVersion.id,
      model: generationResult.model,
      tokensInput: generationResult.tokensInput,
      tokensOutput: generationResult.tokensOutput,
      latencyMs,
      status: 'success',
      escalationReason,
    });

    // Feature de transcrição de áudio (2026-08-24): só no caminho de SUCESSO
    // (mesmo racional de `escalate`/`stage` — nunca gravar um efeito colateral
    // de uma resposta que reprovou na validação). Persiste só se a IA
    // realmente emitiu o marcador E sabemos a qual áudio ele se refere
    // (a única mídia anexada nesta chamada, se for do tipo áudio).
    if (audioTranscript) {
      const audioMessageId = [...mediaByMessageId.entries()].find(([, part]) =>
        part.mimeType.startsWith('audio/'),
      )?.[0];
      if (audioMessageId) {
        await this.persistAudioTranscript(tenantId, audioMessageId, audioTranscript);
      }
    }

    // Feature de descrição de imagem (2026-08-24) — mesmo racional acima,
    // aplicado a imagem.
    if (imageDescription) {
      const imageMessageId = [...mediaByMessageId.entries()].find(([, part]) =>
        part.mimeType.startsWith('image/'),
      )?.[0];
      if (imageMessageId) {
        await this.persistImageDescription(tenantId, imageMessageId, imageDescription);
      }
    }

    return {
      status: 'success',
      content: validation.sanitized,
      model: generationResult.model,
      tokensInput: generationResult.tokensInput,
      tokensOutput: generationResult.tokensOutput,
      aiInteractionId,
      escalationReason,
      suggestedStage,
    };
  }

  /**
   * Busca o texto do perfil de negócio da SESSÃO (Base de Conhecimento, Nível
   * 1 — migrado de 1:1 por tenant para 1:1 por sessão na M6H-3, 2026-07-25)
   * para injetar no prompt. Devolve `undefined` quando: não há repositório
   * injetado (compatibilidade — quem constrói sem ele mantém o comportamento
   * antigo), não há perfil configurado para aquela sessão, ou a leitura falha.
   *
   * DEGRADAÇÃO GRACIOSA (try/catch): o contexto do negócio é uma dependência
   * AUXILIAR, igual ao preço em `calculateCostUsd` — uma falha ao lê-lo (ex.:
   * banco momentaneamente indisponível) nunca deve impedir a resposta ao
   * cliente; melhor responder de forma genérica do que não responder. Sem
   * Logger injetado neste serviço, a falha é silenciosa aqui — mesma limitação
   * consciente já aceita para `costUsd` desconhecido (Bloco 3b); observabilidade
   * dedicada fica para quando este serviço ganhar um Logger.
   */
  /**
   * Carrega o perfil completo da sessão e extrai dois pedaços de contexto para
   * o `PromptBuilder` (F1.8, 2026-08-01):
   *
   * - `businessContext`: o texto livre do "Cérebro da IA" (comportamento
   *   original, pré-existente).
   * - `offHoursContext`: aviso de horário de atendimento, presente só quando
   *   `offHoursEnabled` é `true` E o instante atual está fora da janela
   *   configurada — `undefined` caso contrário (comportamento inalterado, já
   *   que o default é `offHoursEnabled: false`).
   *
   * DEGRADAÇÃO GRACIOSA: sem repositório configurado ou qualquer falha na
   * leitura, devolve `{}` (ambos `undefined`) — mesmo racional do método
   * original `loadBusinessContext`, nunca derruba a resposta da IA.
   */
  private async loadProfileContext(
    tenantId: string,
    sessionName: string,
  ): Promise<{ businessContext?: string; offHoursContext?: string }> {
    if (!this.aiBusinessProfileRepository) {
      return {};
    }
    try {
      const profile = await this.aiBusinessProfileRepository.findByTenantAndSession(
        tenantId,
        sessionName,
      );
      if (!profile) return {};
      return {
        businessContext: profile.content || undefined,
        offHoursContext: getOffHoursContext(profile),
      };
    } catch {
      return {};
    }
  }

  /**
   * Fase L, Bloco L6 — descobre se esta conversa nasceu de uma campanha e,
   * se sim, monta o bloco de contexto (`buildCampaignContext`). DEGRADAÇÃO
   * GRACIOSA, mesmo racional de `loadProfileContext`: sem resolver
   * configurado, ou qualquer falha, devolve `undefined` — nunca impede a
   * resposta ao cliente.
   */
  private async loadCampaignContext(
    tenantId: string,
    conversationId: string,
  ): Promise<string | undefined> {
    if (!this.campaignOriginResolver) {
      return undefined;
    }
    try {
      const origin = await this.campaignOriginResolver.findOrigin(tenantId, conversationId);
      return origin ? buildCampaignContext(origin.messageSent) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Baixa o binário da mensagem de mídia mais RECENTE do histórico (Fase 1,
   * Bloco F1.2) — nunca de todo o histórico. Reenviar o binário de mídias
   * antigas a cada chamada nova multiplicaria custo/latência sem ganho real
   * (a mesma imagem já foi processada pela IA numa resposta anterior); só a
   * mídia mais nova ainda não teve chance de ser "vista". Varre `messages`
   * de trás para frente (mais recente primeiro) e para na primeira
   * mensagem de imagem/áudio encontrada — não precisa ser necessariamente a
   * ÚLTIMA mensagem da conversa (pode haver uma mensagem de texto depois da
   * mídia, ex.: "e aí, conseguiu ver?").
   *
   * DEGRADAÇÃO GRACIOSA (mesmo racional de `loadBusinessContext`): sem
   * `mediaDownloader` configurado, mídia maior que `MAX_MEDIA_BYTES_FOR_AI`,
   * ou qualquer falha no download (`MediaDownloader.download` nunca lança,
   * mas devolve `undefined` em caso de erro) — devolve um mapa vazio. A IA
   * ainda recebe a descrição factual da mídia via `PromptBuilder`; só não
   * recebe o binário. Uma falha aqui NUNCA deveria impedir a resposta ao
   * cliente.
   *
   * Restrito a `image`/`audio` (Fase 1, Bloco F1.2 — escopo aprovado):
   * `video`/`document`/`sticker` continuam representados só pela descrição
   * factual por ora — ampliar para os demais tipos é extensão aditiva
   * futura (F1.2b ou similar), não decidida nesta rodada.
   */
  private async loadLatestInboundMedia(
    tenantId: string,
    sessionName: string,
    messages: Message[],
  ): Promise<Map<string, AiMediaContentPart>> {
    const result = new Map<string, AiMediaContentPart>();
    if (!this.mediaDownloader) {
      return result;
    }

    const latestMediaMessage = [...messages].reverse().find(
      (
        message,
      ): message is Message & {
        contentType: 'image' | 'audio';
        media: NonNullable<Message['media']>;
      } =>
        // CORREÇÃO 2026-08-21 (bug medido em produção): o nome do método
        // sempre disse "Inbound", mas o filtro nunca checou `direction`.
        // Numa conversa nascida de campanha COM ANEXO, a mídia mais recente
        // do histórico é a NOSSA imagem de disparo — ela era baixada (o
        // `AgentMediaCache` passou a guardar mídia de campanha desde a
        // correção de 2026-08-20) e enviada ao Gemini como entrada
        // multimodal, ou seja: o modelo literalmente VIA a própria imagem da
        // campanha e reagia como se o cliente a tivesse mandado ("Vi que você
        // mandou umas imagens"). Interpretar mídia só faz sentido para o que
        // o CLIENTE enviou — o que nós mandamos, nós já sabemos o que é.
        //
        // Feature de transcrição de áudio (2026-08-24): um áudio JÁ
        // transcrito (`audioTranscript` preenchido) deixa de ser reanexado
        // aqui — `describeMessageContent` já mostra a transcrição real no
        // histórico textual, então reenviar o binário de novo gastaria
        // custo/latência sem ganho (mesmo racional do comentário da função
        // acima, "reenviar mídia antiga multiplica custo sem ganho real").
        //
        // Feature de descrição de imagem (2026-08-24): MESMO mecanismo,
        // agora também para imagem (`imageDescription` preenchido) — fecha
        // o gap que a versão anterior desta função deixava documentado
        // como "sem mecanismo equivalente, fora do escopo".
        message.direction === 'inbound' &&
        ((message.contentType === 'image' && !message.imageDescription) ||
          (message.contentType === 'audio' && !message.audioTranscript)) &&
        Boolean(message.media),
    );
    if (!latestMediaMessage) {
      return result;
    }

    try {
      const buffer = await this.mediaDownloader.download(tenantId, sessionName, {
        contentType: latestMediaMessage.contentType,
        mimeType: latestMediaMessage.media.mimeType,
        url: latestMediaMessage.media.url,
        mediaKeyEncrypted: latestMediaMessage.media.mediaKeyEncrypted,
      });
      if (!buffer || buffer.byteLength > MAX_MEDIA_BYTES_FOR_AI) {
        return result;
      }
      result.set(latestMediaMessage.id, {
        mimeType: latestMediaMessage.media.mimeType,
        data: buffer.toString('base64'),
      });
    } catch {
      // Silencioso de propósito, mesma política de `loadBusinessContext`: a
      // interpretação de mídia é auxiliar, sua falha não deve impedir a
      // resposta (a IA cai no fallback textual de `describeMessageContent`).
    }
    return result;
  }

  /**
   * Grava a transcrição extraída de um áudio (feature de transcrição de
   * áudio, 2026-08-24) via `MessageRepository.setAudioTranscript()`.
   * DEGRADAÇÃO GRACIOSA (mesmo racional de `loadProfileContext`/
   * `loadCampaignContext`): sem `messageRepository` configurado, ou
   * qualquer falha na escrita, não faz nada — é enriquecimento auxiliar,
   * nunca pode impedir a resposta já validada de chegar ao cliente.
   */
  private async persistAudioTranscript(
    tenantId: string,
    messageId: string,
    transcript: string,
  ): Promise<void> {
    if (!this.messageRepository) {
      return;
    }
    try {
      await this.messageRepository.setAudioTranscript(tenantId, messageId, transcript);
    } catch {
      // Silencioso de propósito — ver docstring acima.
    }
  }

  /**
   * Grava a descrição extraída de uma imagem (feature de descrição de
   * imagem, 2026-08-24) — mesmo racional/degradação graciosa de
   * `persistAudioTranscript`, ver docstring lá.
   */
  private async persistImageDescription(
    tenantId: string,
    messageId: string,
    description: string,
  ): Promise<void> {
    if (!this.messageRepository) {
      return;
    }
    try {
      await this.messageRepository.setImageDescription(tenantId, messageId, description);
    } catch {
      // Silencioso de propósito — ver docstring de `persistAudioTranscript`.
    }
  }

  /**
   * Devolve o `id` gerado por `aiInteractionRepository.record()` (achado F2)
   * — usado pelo caminho `'success'` de `generateReply()` para montar
   * `ConversationAiResult.aiInteractionId` (Bloco 4). Os caminhos
   * `'provider_error'`/`'validation_rejected'` continuam chamando este
   * método normalmente (a gravação de auditoria acontece em TODA tentativa,
   * inalterado desde o Bloco 3b) — só não usam o `id` devolvido, porque
   * nenhum dos dois gera um envio outbound.
   */
  private async recordInteraction(params: {
    tenantId: string;
    conversationId: string;
    /** Fase 1, Bloco F1.4 (2026-08-01) — `id` da mensagem inbound que originou a tentativa. Gravado em toda tentativa, sucesso ou falha. */
    messageId?: string;
    promptVersionId: string;
    model: string | undefined;
    tokensInput: number;
    tokensOutput: number;
    latencyMs: number;
    status: AiInteraction['status'];
    errorMessage?: string;
    /** Fase 1, Bloco F1.4 (2026-08-01) — só relevante no caminho 'success'. */
    escalationReason?: EscalationReason;
  }): Promise<string> {
    const costUsd = calculateCostUsd(
      this.providerName,
      params.model,
      params.tokensInput,
      params.tokensOutput,
    );

    return this.aiInteractionRepository.record({
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      messageId: params.messageId,
      provider: this.providerName,
      model: params.model,
      promptVersion: params.promptVersionId,
      tokensInput: params.tokensInput,
      tokensOutput: params.tokensOutput,
      costUsd,
      latencyMs: params.latencyMs,
      status: params.status,
      errorMessage: params.errorMessage,
      escalationReason: params.escalationReason,
    });
  }
}
