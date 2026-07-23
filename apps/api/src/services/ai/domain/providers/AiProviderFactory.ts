import { AiProvider } from './AiProvider';
import { AiProviderName } from './AiProviderName';

/**
 * Porta (port) que resolve um `AiProvider` concreto a partir do seu nome —
 * Milestone 3, Bloco 3a. Mesma estrutura de `WhatsAppProviderFactory`
 * (Item 5, Bloco 2), mas com uma diferença deliberada de assinatura: lá, a
 * identidade que varia por chamada é a SESSÃO (`create(tenantId,
 * sessionName)`, cada uma com um socket próprio); aqui, a identidade que
 * varia é o PROVIDER escolhido — não há estado de conexão por chamada, então
 * `create()` recebe só `providerName` (ver
 * `MILESTONE_003_AI_AUTORESPONDER.md` §2.2).
 *
 * `ConversationAiService` (Application) depende só deste port — nunca
 * instancia `ClaudeAiProvider` diretamente, nem sabe que ele existe.
 */
export interface AiProviderFactory {
  create(providerName: AiProviderName): AiProvider;
}
