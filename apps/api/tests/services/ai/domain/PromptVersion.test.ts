import { PromptVersionNotFoundError } from '../../../../src/services/ai/domain/errors/PromptVersionNotFoundError';
import {
  getPromptVersion,
  PROMPT_VERSIONS,
} from '../../../../src/services/ai/domain/PromptVersion';

describe('getPromptVersion', () => {
  it('devolve a PromptVersion registrada para um id existente', () => {
    expect(getPromptVersion('v1')).toBe(PROMPT_VERSIONS.v1);
  });

  it('lança PromptVersionNotFoundError para um id inexistente (achado F2 da auditoria do Bloco 3a)', () => {
    expect(() => getPromptVersion('versao-inexistente')).toThrow(PromptVersionNotFoundError);
    expect(() => getPromptVersion('versao-inexistente')).toThrow(
      'Versão de prompt desconhecida: "versao-inexistente"',
    );
  });
});
