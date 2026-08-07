import Anthropic from '@anthropic-ai/sdk';

import {
  AiProvider,
  AiGenerationRequest,
  AiGenerationResult,
} from '../domain/providers/AiProvider';

/**
 * Valor DEFAULT de `maxTokens` quando o construtor não recebe um valor
 * explícito — não uma decisão de produto (respostas de WhatsApp tendem a ser
 * curtas; este número deve ser revisto com dados reais de uso antes de
 * produção). Desde a auditoria do Bloco 3a (achado F1), deixou de ser uma
 * constante fixa usada direto em `generateReply()`: agora é só o valor
 * default do parâmetro `maxTokens` do construtor — mesmo padrão já usado
 * para `maxReplyLength` em `ConversationAiService`. Quem constrói este
 * provider pode sobrescrever sem editar este arquivo.
 */
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Único arquivo deste projeto autorizado a importar `@anthropic-ai/sdk` —
 * Milestone 3, Bloco 3a. Implementa o port `AiProvider` (Domain) traduzindo
 * `AiGenerationRequest`/`AiGenerationResult` (formato normalizado,
 * independente de provider) de e para o formato específico da API de
 * Mensagens da Anthropic.
 *
 * `model` é parâmetro OBRIGATÓRIO do construtor (sem valor default): a
 * string exata de um modelo Claude válido na API muda com o tempo, e
 * hardcodar um valor aqui arriscaria fixar um identificador desatualizado ou
 * incorreto. Quem constrói este provider (`AiProviderFactoryImpl`, e por
 * trás dela o composition root do Bloco 5) deve fornecer o modelo via
 * configuração (ex.: variável de ambiente `AI_CLAUDE_MODEL`) — mesmo
 * racional já usado para `credentialsMasterKey`/`apiKeyPepper` em outras
 * partes do projeto: segredos/configuração de ambiente nunca hardcoded.
 *
 * Sem retry/timeout customizados aqui: a Milestone já decidiu (§2.1) que
 * retry é responsabilidade do BullMQ (Bloco 4), não deste provider — uma
 * falha da API da Anthropic simplesmente propaga como exceção, e quem chama
 * (`ConversationAiService`) já sabe convertê-la num resultado
 * `'provider_error'`.
 *
 * `maxTokens` é parâmetro OPCIONAL do construtor, com `DEFAULT_MAX_TOKENS`
 * como default (achado F1 da auditoria do Bloco 3a): diferente de `model`,
 * este valor tem um default seguro conhecido hoje, então não precisa ser
 * obrigatório — mas fica configurável pelo mesmo motivo de `model` não ser
 * hardcoded (`AiProviderFactoryImpl`, e por trás dela o composition root do
 * Bloco 5, pode sobrescrever via configuração).
 */
export class ClaudeAiProvider implements AiProvider {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly maxTokens: number = DEFAULT_MAX_TOKENS,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async generateReply(request: AiGenerationRequest): Promise<AiGenerationResult> {
    // Fase 1, Bloco F1.2: `message.media` (binário de imagem/áudio, quando
    // presente) é IGNORADO de propósito aqui — este adapter não implementa
    // envio multimodal ao Claude (`GeminiAiProvider` é o único que hoje
    // suporta). Degradação graciosa por design: `message.content` já
    // carrega a descrição factual da mídia (`PromptBuilder.
    // describeMessageContent`), então a IA ainda reconhece que algo foi
    // enviado, só não "vê"/"ouve" o conteúdo quando o Claude é o provider
    // ativo. Replicar o suporte multimodal aqui é extensão aditiva futura,
    // não decidida nesta rodada (Claude também suporta visão nativamente,
    // mas não áudio pela API de mensagens da Anthropic).
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: request.systemPrompt,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });

    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      content,
      model: response.model,
      tokensInput: response.usage.input_tokens,
      tokensOutput: response.usage.output_tokens,
    };
  }
}
