/**
 * Identificador canônico de um provider de IA — Milestone 3, Bloco 3a.
 * União literal, não `string` livre: mesmo racional do achado F6/ADR #15 já
 * aplicado a `WhatsAppSession.provider` (`prisma/schema.prisma`,
 * `WhatsAppProviderType`) — evita divergências como `'Claude'` vs
 * `'claude'`.
 *
 * `'claude'` (`ClaudeAiProvider`) e `'gemini'` (`GeminiAiProvider`) têm
 * implementação real (o Gemini foi adicionado na M6, para viabilizar o free
 * tier do Google AI Studio em desenvolvimento/planos de menor custo).
 * `'openai'` já existe no TIPO (`AiProviderFactory.create()` aceita os três)
 * mas ainda não tem implementação — adicionar um provider é só uma nova classe
 * de Infrastructure + uma entrada em `AiProviderFactoryImpl`, sem mudar esta
 * união nem nenhum outro contrato de Domain/Application (YAGNI para o que ainda
 * não tem demanda; ver `MILESTONE_003_AI_AUTORESPONDER.md` §2.2).
 */
export type AiProviderName = 'claude' | 'openai' | 'gemini';
