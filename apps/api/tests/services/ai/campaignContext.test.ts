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
   * CORREÇÃO 2026-08-25 (junto com o prompt `v10`): a versão anterior deste
   * texto mandava dizer "o que a empresa faz e por que faz sentido para o
   * negócio dela" já na primeira resposta — medido como a causa raiz do
   * pitch agressivo observado numa conversa real de campanha. O ritmo passa
   * a ser decidido pela regra de estágio do CASO 2 no `systemPrompt`
   * (PromptVersion `v10`, item 3b), não mais ditado aqui.
   */
  it('delega o ritmo de apresentação para a regra de estágio do CASO 2, sem mandar o pitch completo já na primeira resposta', () => {
    const context = buildCampaignContext('Oi!');

    expect(context).toMatch(/regra do CASO 2 do seu prompt de sistema/i);
    expect(context).toMatch(/depende do estágio desta conversa/i);
    expect(context).not.toMatch(/JÁ deve dizer a que veio na primeira resposta/i);
    expect(context).not.toMatch(/diga em uma frase curta o que a\s+empresa faz/i);
  });

  it('preserva a regra de não repetir apresentação/argumento quando o estágio já avançou', () => {
    const context = buildCampaignContext('Oi!');

    expect(context).toMatch(/já se apresentou, nunca repita/i);
  });

  it('preserva a regra de ritmo de v6 — nem no caso de campanha despeja tudo de uma vez', () => {
    const context = buildCampaignContext('Oi!');

    expect(context).toMatch(/um tópico por mensagem/i);
    expect(context).toMatch(/nunca despeje serviço, preço e\s+prazo de uma vez só/i);
  });

  it('instrui a nunca repetir o mesmo argumento em mensagens seguidas', () => {
    const context = buildCampaignContext('Oi!');

    expect(context).toMatch(/nunca repita o mesmo argumento em\s+mensagens seguidas/i);
  });
});
