import { extractStage } from '../../../src/services/ai/domain/stageSignal';

describe('extractStage (pipeline de CRM, Milestone 6, Bloco M6H-5)', () => {
  it('sem marcador: stage undefined e content inalterado', () => {
    const result = extractStage('Claro! O corte custa R$ 50.');
    expect(result).toEqual({ content: 'Claro! O corte custa R$ 50.' });
    expect(result.stage).toBeUndefined();
  });

  it('com marcador válido no fim: extrai o stage e remove o marcador do content', () => {
    const raw = 'Legal, vamos combinar os detalhes do pedido então!\n\n[[ESTAGIO:NEGOTIATING]]';
    const result = extractStage(raw);
    expect(result.stage).toBe('negotiating');
    expect(result.content).toBe('Legal, vamos combinar os detalhes do pedido então!');
    expect(result.content).not.toContain('[[ESTAGIO');
  });

  it('reconhece todos os 5 valores de estágio', () => {
    expect(extractStage('x [[ESTAGIO:NEW]]').stage).toBe('new');
    expect(extractStage('x [[ESTAGIO:CONTACTED]]').stage).toBe('contacted');
    expect(extractStage('x [[ESTAGIO:NEGOTIATING]]').stage).toBe('negotiating');
    expect(extractStage('x [[ESTAGIO:CLOSED_WON]]').stage).toBe('closed_won');
    expect(extractStage('x [[ESTAGIO:CLOSED_LOST]]').stage).toBe('closed_lost');
  });

  it('valor desconhecido dentro do marcador: stage undefined (degradação graciosa), mas marcador ainda é removido do content', () => {
    const raw = 'Resposta qualquer [[ESTAGIO:VALOR_INVENTADO]]';
    const result = extractStage(raw);
    expect(result.stage).toBeUndefined();
    expect(result.content).toBe('Resposta qualquer');
  });

  it('marcador no meio do texto também é removido, sem quebrar o restante da frase', () => {
    const raw = 'Início [[ESTAGIO:CLOSED_WON]] fim';
    const result = extractStage(raw);
    expect(result.stage).toBe('closed_won');
    expect(result.content).not.toContain('[[ESTAGIO');
    expect(result.content).toContain('Início');
    expect(result.content).toContain('fim');
  });

  // Regressão (2026-09-14): mesma classe de bug medida em produção para
  // `[[ESCALAR_HUMANO...` (ver `escalationSignal.test.ts`) — uma resposta
  // cortada por `finishReason === 'MAX_TOKENS'` pode truncar ESTE marcador
  // também, já que os dois vivem no fim absoluto do prompt/resposta.
  it('marcador CORTADO no meio (resposta truncada por MAX_TOKENS): remove o fragmento, sem stage', () => {
    const raw = 'Beleza, te aviso quando resolver.\n\n[[ESTAGIO:CONTACT';
    const result = extractStage(raw);
    expect(result.stage).toBeUndefined();
    expect(result.content).toBe('Beleza, te aviso quando resolver.');
    expect(result.content).not.toContain('[[ESTAGIO');
  });
});
