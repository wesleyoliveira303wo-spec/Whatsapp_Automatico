import { FakeWhatsAppProviderFactory } from './FakeWhatsAppProviderFactory';

describe('FakeWhatsAppProviderFactory', () => {
  it('registra cada chamada de create() com tenantId e sessionName recebidos', () => {
    const factory = new FakeWhatsAppProviderFactory();

    factory.create('tenant-1', 'vendas');
    factory.create('tenant-2', 'suporte');

    expect(factory.createCalls).toEqual([
      { tenantId: 'tenant-1', sessionName: 'vendas' },
      { tenantId: 'tenant-2', sessionName: 'suporte' },
    ]);
  });

  it('cria uma nova instancia a cada chamada de create(), mesmo com os mesmos argumentos (paridade com BaileysProviderFactory)', () => {
    // Mesma propriedade verificada em BaileysProviderFactory.test.ts para a
    // implementacao real: nenhuma das duas faz cache/reuso internamente -
    // essa e uma responsabilidade do futuro WhatsAppConnectionRegistry
    // (Bloco 5), nao da factory. Um Fake que "mentisse" fazendo cache aqui
    // mascararia, nos testes do Registry, exatamente o comportamento que
    // ele precisa exercitar.
    const factory = new FakeWhatsAppProviderFactory();

    const providerA = factory.create('tenant-1', 'vendas');
    const providerB = factory.create('tenant-1', 'vendas'); // mesmos argumentos

    expect(providerA).not.toBe(providerB);
  });

  it('getCreatedProviders() reflete, na ordem, todas as instancias ja criadas', () => {
    const factory = new FakeWhatsAppProviderFactory();

    const providerA = factory.create('tenant-1', 'vendas');
    const providerB = factory.create('tenant-2', 'suporte');

    expect(factory.getCreatedProviders()).toEqual([providerA, providerB]);
  });

  describe('o provider devolvido satisfaz a interface WhatsAppProvider', () => {
    it('connect()/disconnect() resolvem sem lancar', async () => {
      const factory = new FakeWhatsAppProviderFactory();
      const provider = factory.create('tenant-1', 'vendas');

      await expect(provider.connect()).resolves.toBeUndefined();
      await expect(provider.disconnect()).resolves.toBeUndefined();
    });

    it("getStatus() resolve para 'disconnected' (comportamento honesto de um provider recem-criado, nunca conectado)", async () => {
      const factory = new FakeWhatsAppProviderFactory();
      const provider = factory.create('tenant-1', 'vendas');

      await expect(provider.getStatus()).resolves.toBe('disconnected');
    });

    it('getQRCode() resolve para uma string', async () => {
      const factory = new FakeWhatsAppProviderFactory();
      const provider = factory.create('tenant-1', 'vendas');

      await expect(provider.getQRCode()).resolves.toEqual(expect.any(String));
    });

    it('getPhoneNumber() resolve para undefined', async () => {
      const factory = new FakeWhatsAppProviderFactory();
      const provider = factory.create('tenant-1', 'vendas');

      await expect(provider.getPhoneNumber()).resolves.toBeUndefined();
    });

    it('onEvent() aceita um listener sem lancar', () => {
      const factory = new FakeWhatsAppProviderFactory();
      const provider = factory.create('tenant-1', 'vendas');

      expect(() => provider.onEvent(() => {})).not.toThrow();
    });
  });
});
