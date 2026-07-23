/**
 * Erro de Domain para quando `AiProviderFactory.create()` recebe um
 * `AiProviderName` sem implementação registrada (hoje, `'openai'`/`'gemini'`
 * — só `'claude'` tem uma classe de Infrastructure real). Substitui o uso de
 * `Error` genérico (achado F2 da auditoria técnica do Bloco 3a), pelo mesmo
 * motivo já usado em `WhatsAppSessionNotFoundError` /
 * `WhatsAppQRCodeNotAvailableError` / `WhatsAppNotConnectedError`
 * (`services/whatsapp/domain/errors/`): permite que a camada de Presentation
 * (futuro `errorMiddleware`) e o worker do Bloco 4 mapeiem este erro por
 * `instanceof`, nunca por comparação de string de mensagem.
 *
 * Só pode ocorrer com um `providerName` vindo de configuração (ex.: variável
 * de ambiente `AI_PROVIDER` do composition root, Bloco 5, resolvida como
 * `string` solta e então convertida para `AiProviderName`) — nunca de um
 * caminho normal de execução com tipos já validados em compile-time.
 */
export class AiProviderNotSupportedError extends Error {
  constructor(providerName: string) {
    super(`Provider de IA "${providerName}" ainda não possui implementação registrada nesta factory.`);
    this.name = 'AiProviderNotSupportedError';
  }
}
