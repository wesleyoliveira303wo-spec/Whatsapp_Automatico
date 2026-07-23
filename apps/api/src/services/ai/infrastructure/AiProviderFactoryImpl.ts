import { AiProviderNotSupportedError } from '../domain/errors/AiProviderNotSupportedError';
import { AiProvider } from '../domain/providers/AiProvider';
import { AiProviderFactory } from '../domain/providers/AiProviderFactory';
import { AiProviderName } from '../domain/providers/AiProviderName';
import { ClaudeAiProvider } from './ClaudeAiProvider';
import { GeminiAiProvider } from './GeminiAiProvider';

/**
 * Configuração de um provider concreto — `apiKey` + `model` obrigatórios,
 * `maxTokens` opcional (cada provider aplica seu próprio default quando
 * omitido). Um mesmo shape serve Claude e Gemini porque ambos os construtores
 * já seguem a mesma ordem `(apiKey, model, maxTokens?)`.
 */
export interface AiProviderConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
}

/**
 * Opções da factory — cada provider é OPCIONAL: só entra no mapa quem foi
 * configurado. Rodar só com Gemini (ou só com Claude) é um caminho legítimo
 * (ex.: free tier em desenvolvimento não precisa de credencial da Anthropic).
 */
export interface AiProviderFactoryOptions {
  claude?: AiProviderConfig;
  gemini?: AiProviderConfig;
}

/**
 * Implementação real de `AiProviderFactory` — Milestone 3, Bloco 3a; estendida
 * para múltiplos providers na M6 (Gemini). Resolve por
 * `Map<AiProviderName, () => AiProvider>` (não `switch`), exatamente como
 * `MILESTONE_003_AI_AUTORESPONDER.md` §2.2 especifica: adicionar um provider é
 * uma nova classe de Infrastructure + uma entrada neste mapa — zero mudança em
 * `ConversationAiService`, `PromptBuilder`, `ReplyValidator` ou qualquer outro
 * consumidor do port `AiProviderFactory`.
 *
 * REFATORAÇÃO DO CONSTRUTOR (M6): o construtor posicional original
 * `(claudeApiKey, claudeModel, claudeMaxTokens?)` não escalava para um segundo
 * provider (viraria uma fila de 6+ argumentos posicionais). Passou a receber um
 * options-object `{ claude?, gemini? }` — cada provider só é registrado quando
 * sua config está presente. É o momento clássico de trocar posicional por
 * objeto: quando o segundo caso concreto chega. Blast radius mínimo: só o
 * composition root (`worker.ts`) e este teste constroem a factory diretamente.
 *
 * Cada entrada do mapa é uma FUNÇÃO fábrica, não uma instância já construída —
 * `create()` sempre devolve uma instância nova (mesmo contrato de
 * `WhatsAppProviderFactory`; os providers são stateless, não há razão de
 * correção para cachear).
 *
 * Um provider não configurado (ausente no options) resulta em
 * `AiProviderNotSupportedError` ao ser pedido — o mesmo erro usado para um nome
 * sem implementação nenhuma. Do ponto de vista de quem chama, "não implementado"
 * e "não configurado neste deploy" são indistinguíveis e igualmente bloqueantes;
 * unificar num único erro evita um segundo caminho de falha para manter.
 *
 * Este arquivo (e as classes `ClaudeAiProvider`/`GeminiAiProvider`) são os
 * únicos que conhecem as classes concretas — mas não importam nenhuma SDK/HTTP
 * de terceiros diretamente, só as classes que as encapsulam (padrão Factory).
 */
export class AiProviderFactoryImpl implements AiProviderFactory {
  private readonly factories: Map<AiProviderName, () => AiProvider>;

  constructor(options: AiProviderFactoryOptions) {
    this.factories = new Map<AiProviderName, () => AiProvider>();

    const { claude, gemini } = options;
    if (claude) {
      this.factories.set('claude', () => new ClaudeAiProvider(claude.apiKey, claude.model, claude.maxTokens));
    }
    if (gemini) {
      this.factories.set('gemini', () => new GeminiAiProvider(gemini.apiKey, gemini.model, gemini.maxTokens));
    }
  }

  create(providerName: AiProviderName): AiProvider {
    const factory = this.factories.get(providerName);
    if (!factory) {
      throw new AiProviderNotSupportedError(providerName);
    }
    return factory();
  }
}
