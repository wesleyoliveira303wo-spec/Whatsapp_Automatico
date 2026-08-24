import { buildCampaignContext } from '../../../src/services/ai/domain/campaignContext';

describe('buildCampaignContext (Fase L, Bloco L6)', () => {
  it('inclui a mensagem enviada e o rótulo de origem', () => {
    const context = buildCampaignContext('Olá! Temos uma promoção especial para você.');

    expect(context).toContain('# Origem desta conversa');
    expect(context).toContain('Olá! Temos uma promoção especial para você.');
    expect(context).toContain('NÓS enviamos');
  });

  it('instrui a IA a não perguntar por que o cliente entrou em contato', () => {
    const context = buildCampaignContext('Oi!');

    expect(context).toContain('Não pergunte por que ela está entrando em contato');
  });

  it('instrui a IA a encerrar com cordialidade se não houver interesse', () => {
    const context = buildCampaignContext('Oi!');

    expect(context).toContain('encerre com cordialidade e sem insistir');
  });

  /**
   * Reforço de 2026-08-24 (junto com o prompt `v7`): sem estas instruções, a
   * postura de DESCOBERTA — que `v7` tornou o padrão correto para quando o
   * cliente procura a empresa — vazaria para o caso de campanha, onde ela
   * está errada (a pessoa está respondendo a uma abordagem nossa).
   */
  it('manda apresentar o serviço já na primeira resposta (nunca segurar para "conhecer o cliente" antes)', () => {
    const context = buildCampaignContext('Oi!');

    expect(context).toMatch(/JÁ deve dizer a que veio na primeira resposta/i);
    expect(context).toMatch(/diga em uma frase curta o que a\s+empresa faz/i);
    expect(context).toMatch(
      /Não fique\s+perguntando o nome e o ramo dela antes de explicar quem é você/i,
    );
  });

  it('preserva a regra de ritmo de v6 — nem no caso de campanha despeja tudo de uma vez', () => {
    const context = buildCampaignContext('Oi!');

    expect(context).toMatch(/um tópico por mensagem/i);
    expect(context).toMatch(/nunca despeje serviço, preço e\s+prazo de uma vez só/i);
  });
});
