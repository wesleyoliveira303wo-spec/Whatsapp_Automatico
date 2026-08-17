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
});
