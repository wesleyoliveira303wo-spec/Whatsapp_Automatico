import { isOptOutKeyword } from '../../../src/services/contacts/domain/optOutKeywords';

describe('isOptOutKeyword', () => {
  it('reconhece as palavras-chave básicas', () => {
    expect(isOptOutKeyword('parar')).toBe(true);
    expect(isOptOutKeyword('pare')).toBe(true);
    expect(isOptOutKeyword('sair')).toBe(true);
    expect(isOptOutKeyword('stop')).toBe(true);
    expect(isOptOutKeyword('cancelar')).toBe(true);
    expect(isOptOutKeyword('descadastrar')).toBe(true);
    expect(isOptOutKeyword('remover')).toBe(true);
  });

  it('é case-insensitive', () => {
    expect(isOptOutKeyword('PARAR')).toBe(true);
    expect(isOptOutKeyword('Parar')).toBe(true);
    expect(isOptOutKeyword('StOp')).toBe(true);
  });

  it('ignora espaços nas pontas e pontuação final', () => {
    expect(isOptOutKeyword('  parar  ')).toBe(true);
    expect(isOptOutKeyword('parar!')).toBe(true);
    expect(isOptOutKeyword('parar.')).toBe(true);
    expect(isOptOutKeyword('parar?')).toBe(true);
  });

  it('ignora acentos', () => {
    expect(isOptOutKeyword('não quero receber')).toBe(true);
    expect(isOptOutKeyword('nao quero receber')).toBe(true);
  });

  // O caso central desta função: substring NUNCA casa, só a mensagem inteira.
  it('NÃO dispara quando a palavra aparece dentro de uma frase maior', () => {
    expect(isOptOutKeyword('desculpe, hoje não posso, te chamo amanhã sem falta')).toBe(false);
    expect(isOptOutKeyword('pode parar de mandar isso por favor')).toBe(false);
    expect(isOptOutKeyword('vou sair de casa agora')).toBe(false);
    expect(isOptOutKeyword('cancela minha consulta de amanhã')).toBe(false);
  });

  it('NÃO dispara para mensagens comuns de atendimento', () => {
    expect(isOptOutKeyword('Olá, bom dia!')).toBe(false);
    expect(isOptOutKeyword('Qual o preço?')).toBe(false);
    expect(isOptOutKeyword('obrigado')).toBe(false);
  });

  it('NÃO dispara para mensagem vazia', () => {
    expect(isOptOutKeyword('')).toBe(false);
    expect(isOptOutKeyword('   ')).toBe(false);
  });
});
