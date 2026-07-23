import { Message } from '../../conversations/domain/entities/Message';
import { AiInteraction } from '../domain/entities/AiInteraction';
import { AiInteractionRepository } from '../domain/repositories/AiInteractionRepository';
import { AiBusinessProfileRepository } from '../domain/repositories/AiBusinessProfileRepository';
import { calculateCostUsd } from '../domain/AiPricing';
import { PromptVersion } from '../domain/PromptVersion';
import { AiGenerationResult } from '../domain/providers/AiProvider';
import { AiProviderFactory } from '../domain/providers/AiProviderFactory';
import { AiProviderName } from '../domain/providers/AiProviderName';
import { validateReply } from '../domain/ReplyValidator';
import { extractEscalation } from '../domain/escalationSignal';
import { PromptBuilder } from './PromptBuilder';

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
       * Feature N2 (auto-escalonamento): `true` quando a IA emitiu o marcador
       * de escalonamento (`ESCALATION_MARKER`) — o `content` já vem SEM o
       * marcador (o cliente nunca o vê). Quem consome (`AiReplyJobProcessor`)
       * envia a mensagem e, se `escalate`, coloca a conversa em atendimento
       * humano.
       */
      escalate: boolean;
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
 * `messageId` nunca é preenchido por este bloco (fica `undefined` em todo
 * `AiInteraction` gravado aqui) — este bloco não cria a `Message` outbound
 * com a resposta da IA; isso só acontece quando o envio de fato ocorre
 * (Bloco 4). `model` fica `undefined` no caminho `'provider_error'` — a
 * chamada falhou antes de qualquer resposta (e portanto de qualquer `model`
 * real) chegar.
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
  ) {}

  async generateReply(
    tenantId: string,
    conversationId: string,
    messages: Message[],
    promptVersion: PromptVersion,
  ): Promise<ConversationAiResult> {
    const businessContext = await this.loadBusinessContext(tenantId);
    const request = this.promptBuilder.build(messages, promptVersion, businessContext);
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
    const { escalate, content: cleanedContent } = extractEscalation(generationResult.content);
    const validation = validateReply(cleanedContent, this.maxReplyLength);

    if (!validation.valid) {
      await this.recordInteraction({
        tenantId,
        conversationId,
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
      promptVersionId: promptVersion.id,
      model: generationResult.model,
      tokensInput: generationResult.tokensInput,
      tokensOutput: generationResult.tokensOutput,
      latencyMs,
      status: 'success',
    });

    return {
      status: 'success',
      content: validation.sanitized,
      model: generationResult.model,
      tokensInput: generationResult.tokensInput,
      tokensOutput: generationResult.tokensOutput,
      aiInteractionId,
      escalate,
    };
  }

  /**
   * Busca o texto do perfil de negócio do tenant (Base de Conhecimento, Nível
   * 1) para injetar no prompt. Devolve `undefined` quando: não há repositório
   * injetado (compatibilidade — quem constrói sem ele mantém o comportamento
   * antigo), não há perfil configurado, ou a leitura falha.
   *
   * DEGRADAÇÃO GRACIOSA (try/catch): o contexto do negócio é uma dependência
   * AUXILIAR, igual ao preço em `calculateCostUsd` — uma falha ao lê-lo (ex.:
   * banco momentaneamente indisponível) nunca deve impedir a resposta ao
   * cliente; melhor responder de forma genérica do que não responder. Sem
   * Logger injetado neste serviço, a falha é silenciosa aqui — mesma limitação
   * consciente já aceita para `costUsd` desconhecido (Bloco 3b); observabilidade
   * dedicada fica para quando este serviço ganhar um Logger.
   */
  private async loadBusinessContext(tenantId: string): Promise<string | undefined> {
    if (!this.aiBusinessProfileRepository) {
      return undefined;
    }
    try {
      const profile = await this.aiBusinessProfileRepository.findByTenant(tenantId);
      return profile?.content;
    } catch {
      return undefined;
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
    promptVersionId: string;
    model: string | undefined;
    tokensInput: number;
    tokensOutput: number;
    latencyMs: number;
    status: AiInteraction['status'];
    errorMessage?: string;
  }): Promise<string> {
    const costUsd = calculateCostUsd(this.providerName, params.model, params.tokensInput, params.tokensOutput);

    return this.aiInteractionRepository.record({
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      provider: this.providerName,
      model: params.model,
      promptVersion: params.promptVersionId,
      tokensInput: params.tokensInput,
      tokensOutput: params.tokensOutput,
      costUsd,
      latencyMs: params.latencyMs,
      status: params.status,
      errorMessage: params.errorMessage,
    });
  }
}
