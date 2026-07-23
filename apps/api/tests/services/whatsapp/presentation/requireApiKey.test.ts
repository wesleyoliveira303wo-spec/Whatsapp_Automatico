/**
 * MOVIDO para `tests/shared/presentation/requireApiKey.test.ts` na
 * Milestone 3, Bloco 5 (D9 - mesma justificativa da versao movida do
 * middleware em `src/shared/presentation/requireApiKey.ts`).
 *
 * Este arquivo continua existindo neste caminho so por limitacao do sandbox
 * (`rm`/`mv` falharam com `EPERM` - ver comentario equivalente no arquivo de
 * producao). Nao duplica a suite real: mantem apenas um teste de guarda
 * (sanity check) confirmando que o modulo real, no novo caminho, exporta o
 * que se espera - a cobertura de comportamento completa vive so no arquivo
 * novo.
 *
 * ACAO PENDENTE para Wesley no ambiente local: apagar fisicamente este
 * arquivo (`git rm apps/api/tests/services/whatsapp/presentation/requireApiKey.test.ts`).
 */
import { createRequireApiKey } from '../../../../src/shared/presentation/requireApiKey';

describe('requireApiKey (arquivo movido - ver tests/shared/presentation/requireApiKey.test.ts)', () => {
  it('sanity check: o modulo real, no novo caminho, exporta createRequireApiKey', () => {
    expect(typeof createRequireApiKey).toBe('function');
  });
});
