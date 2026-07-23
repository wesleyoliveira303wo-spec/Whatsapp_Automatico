import { WhatsAppProvider } from '../../../../src/services/whatsapp/domain/providers/WhatsAppProvider';
import { WhatsAppProviderEvent } from '../../../../src/services/whatsapp/domain/providers/WhatsAppProviderEvent';
import { WhatsAppSession } from '../../../../src/services/whatsapp/domain/entities/WhatsAppSession';
import { WhatsAppProviderFactory } from '../../../../src/services/whatsapp/domain/providers/WhatsAppProviderFactory';

/**
 * Implementacao minima e inerte de `WhatsAppProvider`, usada apenas como o
 * objeto devolvido por `FakeWhatsAppProviderFactory.create()` abaixo.
 *
 * Deliberadamente distinta do `FakeWhatsAppProvider` ja existente (inline)
 * em `SessionManager.test.ts` -- aquele simula o ciclo de vida completo de
 * conexao/eventos, necessario para testar o `SessionManager`. Este aqui so
 * precisa satisfazer a interface `WhatsAppProvider` e ser uma instancia
 * distinguivel por referencia; nao simula nenhum comportamento de conexao.
 * Consolidar os dois (se fizer sentido) fica para o Bloco 6 (extracao dos
 * Test Doubles compartilhados) -- nao antecipado aqui.
 */
export class NullWhatsAppProvider implements WhatsAppProvider {
  private listener: ((event: WhatsAppProviderEvent) => void) | undefined;

  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {}

  async getStatus(): Promise<WhatsAppSession['status']> {
    return 'disconnected';
  }

  async getQRCode(): Promise<string> {
    return 'fake-qr-code';
  }

  async getPhoneNumber(): Promise<string | undefined> {
    return undefined;
  }

  /**
   * Milestone 3, Bloco 4: registra chamadas (`sendMessageCalls`) e permite
   * simular falha (`nextSendMessageError`) — necessário para testar
   * `OutboundCommandConsumer` (decisão D4: sessão sem conexão viva deve
   * propagar `WhatsAppNotConnectedError` do provider, não engolir). Continua
   * "inerte" por padrão (nunca lança, só registra) — comportamento anterior
   * preservado para todo teste existente que não configura
   * `nextSendMessageError`.
   */
  public sendMessageCalls: { to: string; content: string }[] = [];

  public nextSendMessageError: Error | undefined;

  async sendMessage(to: string, content: string): Promise<void> {
    if (this.nextSendMessageError) {
      const error = this.nextSendMessageError;
      this.nextSendMessageError = undefined;
      throw error;
    }
    this.sendMessageCalls.push({ to, content });
  }

  onEvent(listener: (event: WhatsAppProviderEvent) => void): void {
    this.listener = listener;
  }

  /**
   * Helper de teste (Production Hardening, Bloco 4) -- emite um evento para
   * o listener registrado, se houver. Necessario para os testes de
   * `WhatsAppConnectionRegistry.evictIfCurrent()`, que precisam simular uma
   * reconexao (evento `status_changed` com `status: 'connecting'`) SEM
   * depender do ciclo de vida completo do `SessionManager.init()` -- mesmo
   * papel de `FakeWhatsAppProvider.emitEvent()` em `SessionManager.test.ts`,
   * so que aqui a instancia e obtida indiretamente via
   * `FakeWhatsAppProviderFactory.getCreatedProviders()`.
   */
  emitEvent(event: WhatsAppProviderEvent): void {
    this.listener?.(event);
  }
}

/**
 * Fake de `WhatsAppProviderFactory` para uso em testes (Item 5, Bloco 2 -
 * consumido pelo futuro `WhatsAppConnectionRegistry`, Bloco 5). Nao
 * depende de Baileys nem de qualquer detalhe de Infrastructure real.
 *
 * Mesma regra de nao-cache do `WhatsAppProviderFactory` real
 * (`BaileysProviderFactory`): cada `create()` devolve uma instancia NOVA de
 * `NullWhatsAppProvider`, mesmo que chamado duas vezes com os mesmos
 * argumentos -- essa paridade de comportamento com a implementacao real e
 * verificada explicitamente em `FakeWhatsAppProviderFactory.test.ts`.
 *
 * Registra as chamadas (`createCalls`) e as instancias criadas
 * (`getCreatedProviders()`) para permitir que testes futuros (Bloco 5)
 * verifiquem quantas vezes/com quais argumentos `create()` foi chamado, e
 * comparem instancias por referencia.
 */
export class FakeWhatsAppProviderFactory implements WhatsAppProviderFactory {
  public readonly createCalls: Array<{ tenantId: string; sessionName: string }> = [];
  private readonly createdProviders: NullWhatsAppProvider[] = [];

  create(tenantId: string, sessionName: string): WhatsAppProvider {
    this.createCalls.push({ tenantId, sessionName });
    const provider = new NullWhatsAppProvider();
    this.createdProviders.push(provider);
    return provider;
  }

  /**
   * Retorna o tipo concreto (`NullWhatsAppProvider`, não só o port
   * `WhatsAppProvider`) -- amplia deliberadamente o tipo de retorno
   * (Production Hardening, Bloco 4) para expor `emitEvent()` aos testes do
   * Registry, sem quebrar nenhum consumidor existente (todo o resto só usa
   * os métodos do port, que continuam disponíveis por herança estrutural).
   */
  getCreatedProviders(): ReadonlyArray<NullWhatsAppProvider> {
    return this.createdProviders;
  }
}
