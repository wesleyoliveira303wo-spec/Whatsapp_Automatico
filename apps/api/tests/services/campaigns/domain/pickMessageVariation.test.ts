import { pickMessageVariation, MESSAGE_SKELETONS } from '../../../../src/services/campaigns/domain/policies/pickMessageVariation';

describe('pickMessageVariation (Fase de Prospecção IA, Seção 2 do playbook — variação estrutural)', () => {
  it('nunca repete o esqueleto entre dois índices consecutivos', () => {
    for (let index = 1; index < 20; index += 1) {
      const previous = pickMessageVariation(index - 1, 4);
      const current = pickMessageVariation(index, 4);
      expect(current.skeleton).not.toBe(previous.skeleton);
    }
  });

  it('roda por todos os esqueletos definidos, na ordem, e repete o ciclo depois disso', () => {
    const total = MESSAGE_SKELETONS.length;
    for (let index = 0; index < total; index += 1) {
      expect(pickMessageVariation(index, 4).skeleton).toBe(MESSAGE_SKELETONS[index]);
    }
    expect(pickMessageVariation(total, 4).skeleton).toBe(MESSAGE_SKELETONS[0]);
  });

  it('roda o índice do gancho dentro da quantidade de ganchos disponíveis do lead', () => {
    expect(pickMessageVariation(0, 3).hookIndex).toBe(0);
    expect(pickMessageVariation(1, 3).hookIndex).toBe(1);
    expect(pickMessageVariation(3, 3).hookIndex).toBe(0); // cicla
  });

  it('com hooksCount 0 (planilha sem ganchos), devolve hookIndex 0 sem lançar', () => {
    expect(() => pickMessageVariation(5, 0)).not.toThrow();
    expect(pickMessageVariation(5, 0).hookIndex).toBe(0);
  });
});
