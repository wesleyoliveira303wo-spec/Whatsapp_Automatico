import {
  AiProvider,
  AiGenerationRequest,
  AiGenerationResult,
} from '../../../../src/services/ai/domain/providers/AiProvider';
import { AiProviderFactory } from '../../../../src/services/ai/domain/providers/AiProviderFactory';
import { AiProviderName } from '../../../../src/services/ai/domain/providers/AiProviderName';

/**
 * Fake de `AiProvider` (Milestone 3, Bloco 3a) — devolve respostas
 * determinísticas e configuráveis, nunca gasta tokens reais (mesmo papel de
 * `NullWhatsAppProvider`, mas configurável em vez de inerte: os testes deste
 * bloco precisam simular tanto sucesso quanto falha do provider).
 */
export class FakeAiProvider implements AiProvider {
  public readonly generateReplyCalls: AiGenerationRequest[] = [];

  private nextResult: AiGenerationResult = {
    content: 'resposta padrão de teste',
    model: 'fake-model',
    tokensInput: 0,
    tokensOutput: 0,
  };

  private nextError: Error | undefined;

  async generateReply(request: AiGenerationRequest): Promise<AiGenerationResult> {
    this.generateReplyCalls.push(request);
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = undefined;
      throw error;
    }
    return this.nextResult;
  }

  /** Helper de teste: configura o próximo resultado devolvido por generateReply(). Não faz parte da interface de produção. */
  setNextResult(result: AiGenerationResult): void {
    this.nextResult = result;
  }

  /** Helper de teste: força a próxima chamada a generateReply() a rejeitar, uma única vez. Não faz parte da interface de produção. */
  setNextError(error: Error): void {
    this.nextError = error;
  }
}

/**
 * Fake de `AiProviderFactory` (Milestone 3, Bloco 3a) — mesmo papel de
 * `FakeWhatsAppProviderFactory`: registra as chamadas a `create()` e sempre
 * devolve a MESMA instância de `FakeAiProvider` (diferente de
 * `FakeWhatsAppProviderFactory`/`AiProviderFactoryImpl`, que criam uma
 * instância nova por chamada — aqui a instância única é deliberada, para que
 * os testes configurem `provider.setNextResult()`/`setNextError()` antes de
 * exercitar `ConversationAiService` e leiam `provider.generateReplyCalls`
 * depois, sem precisar rastrear qual instância foi devolvida).
 */
export class FakeAiProviderFactory implements AiProviderFactory {
  public readonly createCalls: AiProviderName[] = [];
  public readonly provider = new FakeAiProvider();

  create(providerName: AiProviderName): AiProvider {
    this.createCalls.push(providerName);
    return this.provider;
  }
}
