import { Message } from '../../conversations/domain/entities/Message';
import { PromptVersion } from '../domain/PromptVersion';
import { AiGenerationRequest } from '../domain/providers/AiProvider';

/**
 * Transforma o histórico de uma conversa (`Message[]`, de
 * `services/conversations/domain`) + a `PromptVersion` ativa num
 * `AiGenerationRequest` pronto para qualquer `AiProvider` — Milestone 3,
 * Bloco 3a (ver `MILESTONE_003_AI_AUTORESPONDER.md` §2.3, tabela de
 * responsabilidades).
 *
 * Depende do tipo `Message` (dado puro de Domain de outro bounded context,
 * sem nenhum acoplamento a Prisma/Repository) para saber como mapear
 * `direction` para o `role` que a API de geração espera
 * (`'inbound' -> 'user'`, `'outbound' -> 'assistant'`) — não depende de
 * `MessageRepository`, `Prisma`, `BullMQ`, `Worker`, WhatsApp ou Baileys:
 * quem busca o histórico e decide QUANTAS mensagens passar é
 * responsabilidade de quem chama `build()` (`ConversationAiService`, e no
 * futuro o worker do Bloco 4), não deste componente.
 *
 * Classe (não função pura solta), para acompanhar o estilo já usado pelos
 * demais componentes de Application deste projeto (`SessionManager`,
 * `WhatsAppSessionService`, `MessageIngestionService`) — mesmo sem estado
 * próprio, mantém a mesma convenção de camada em vez de misturar estilos.
 *
 * BASE DE CONHECIMENTO (Nível 1): `build()` aceita um `businessContext`
 * OPCIONAL — o texto livre que o dono do negócio configurou (ver
 * `AiBusinessProfile`). Quando presente e não vazio, é ANEXADO ao
 * `systemPrompt` base num bloco rotulado, nunca o substituindo: as regras de
 * segurança do prompt base (não inventar preço/prazo, escalar quando não
 * souber) precisam continuar valendo — o contexto do negócio adiciona FATOS
 * por cima, não afrouxa as regras. Parâmetro opcional de propósito: sem perfil
 * configurado (ou perfil vazio), o comportamento é exatamente o de antes
 * (compatibilidade total), e nenhum chamador antigo precisa mudar.
 */
export class PromptBuilder {
  build(messages: Message[], promptVersion: PromptVersion, businessContext?: string): AiGenerationRequest {
    return {
      systemPrompt: this.composeSystemPrompt(promptVersion.systemPrompt, businessContext),
      messages: messages.map((message) => ({
        role: message.direction === 'inbound' ? 'user' : 'assistant',
        content: message.content,
      })),
    };
  }

  /**
   * Anexa o contexto do negócio ao prompt base, se houver. `trim()` para
   * ignorar um texto só de espaços em branco (que não agrega nada ao prompt e
   * ainda gastaria tokens). O rótulo em português e a instrução curta ("baseie
   * suas respostas nas informações abaixo") orientam o modelo a tratar o bloco
   * como a fonte de verdade sobre a empresa, reforçando — não substituindo — a
   * regra anti-alucinação do prompt base.
   */
  private composeSystemPrompt(basePrompt: string, businessContext?: string): string {
    const trimmed = businessContext?.trim();
    if (!trimmed) {
      return basePrompt;
    }
    return (
      `${basePrompt}\n\n` +
      'Baseie suas respostas nas informações da empresa abaixo. ' +
      'Se a informação necessária não estiver nelas, não invente — siga a regra de encaminhar para um atendente humano.\n\n' +
      `# Informações da empresa\n${trimmed}`
    );
  }
}
