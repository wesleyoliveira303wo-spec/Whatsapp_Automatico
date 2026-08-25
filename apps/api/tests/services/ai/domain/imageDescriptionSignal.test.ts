import {
  extractImageDescription,
  IMAGE_DESCRIPTION_MARKER_PREFIX,
  IMAGE_DESCRIPTION_MARKER_SUFFIX,
} from '../../../../src/services/ai/domain/imageDescriptionSignal';

describe('extractImageDescription', () => {
  it('devolve o conteúdo inalterado e description=undefined quando não há marcador', () => {
    const result = extractImageDescription('Oi, tudo bem?');
    expect(result).toEqual({ content: 'Oi, tudo bem?' });
  });

  it('extrai a descrição e remove o marcador do conteúdo visível', () => {
    const raw =
      'Legal, recebi a foto da sua loja!\n' +
      `${IMAGE_DESCRIPTION_MARKER_PREFIX}foto de uma loja de roupas, com araras de roupas penduradas e um balcão de caixa ao fundo${IMAGE_DESCRIPTION_MARKER_SUFFIX}`;
    const result = extractImageDescription(raw);
    expect(result.description).toBe(
      'foto de uma loja de roupas, com araras de roupas penduradas e um balcão de caixa ao fundo',
    );
    expect(result.content).toBe('Legal, recebi a foto da sua loja!');
  });

  it('remove só o PRIMEIRO marcador, mesmo com múltiplas ocorrências', () => {
    const raw =
      `${IMAGE_DESCRIPTION_MARKER_PREFIX}primeira${IMAGE_DESCRIPTION_MARKER_SUFFIX}\n` +
      `resto da resposta\n` +
      `${IMAGE_DESCRIPTION_MARKER_PREFIX}segunda${IMAGE_DESCRIPTION_MARKER_SUFFIX}`;
    const result = extractImageDescription(raw);
    expect(result.description).toBe('primeira');
    expect(result.content).toContain(IMAGE_DESCRIPTION_MARKER_PREFIX);
  });

  it('marcador vazio devolve description=undefined (degradação graciosa)', () => {
    const raw = `Recebi sua imagem.\n${IMAGE_DESCRIPTION_MARKER_PREFIX}${IMAGE_DESCRIPTION_MARKER_SUFFIX}`;
    const result = extractImageDescription(raw);
    expect(result.description).toBeUndefined();
    expect(result.content).toBe('Recebi sua imagem.');
  });

  it('apara espaços em volta da descrição capturada', () => {
    const raw = `${IMAGE_DESCRIPTION_MARKER_PREFIX}   texto com espaços   ${IMAGE_DESCRIPTION_MARKER_SUFFIX}`;
    const result = extractImageDescription(raw);
    expect(result.description).toBe('texto com espaços');
  });

  it('colapsa linhas em branco sobrando após remover o marcador', () => {
    const raw =
      'Primeira parte da resposta.\n\n\n' +
      `${IMAGE_DESCRIPTION_MARKER_PREFIX}o que aparece na imagem${IMAGE_DESCRIPTION_MARKER_SUFFIX}\n\n\n` +
      'Segunda parte da resposta.';
    const result = extractImageDescription(raw);
    expect(result.content).not.toMatch(/\n{3,}/);
  });

  it('funciona junto de outros marcadores no mesmo texto', () => {
    const raw =
      'Legal! Já entendi o que você quer.\n' +
      `${IMAGE_DESCRIPTION_MARKER_PREFIX}print de um site de e-commerce com carrinho de compras${IMAGE_DESCRIPTION_MARKER_SUFFIX}\n` +
      '[[ESTAGIO:NEGOTIATING]]';
    const result = extractImageDescription(raw);
    expect(result.description).toBe('print de um site de e-commerce com carrinho de compras');
    expect(result.content).toContain('[[ESTAGIO:NEGOTIATING]]');
    expect(result.content).toContain('Legal! Já entendi o que você quer.');
  });
});
