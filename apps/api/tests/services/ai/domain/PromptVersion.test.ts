import { PromptVersionNotFoundError } from '../../../../src/services/ai/domain/errors/PromptVersionNotFoundError';
import {
  ESCALATION_MARKER_UNKNOWN_ANSWER,
  ESCALATION_MARKER_REQUESTED_HUMAN,
} from '../../../../src/services/ai/domain/escalationSignal';
import { STAGE_MARKER_PREFIX } from '../../../../src/services/ai/domain/stageSignal';
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

describe('v2 (Fase 1, Fase H — prompt consultivo, 2026-08-08)', () => {
  it('está registrada e é resolvível por id, sem substituir v1', () => {
    expect(getPromptVersion('v2')).toBe(PROMPT_VERSIONS.v2);
    expect(PROMPT_VERSIONS.v1).toBeDefined();
    expect(PROMPT_VERSIONS.v2.systemPrompt).not.toBe(PROMPT_VERSIONS.v1.systemPrompt);
  });

  it('instrui a IA a entender a necessidade ANTES de ofertar/precificar (postura consultiva)', () => {
    const prompt = PROMPT_VERSIONS.v2.systemPrompt;
    expect(prompt).toMatch(/ANTES de oferecer qualquer serviço/i);
    expect(prompt).toMatch(/não presuma que todo contato é cliente/i);
    expect(prompt).toMatch(/nunca pergunte de novo algo que ela já respondeu/i);
  });

  it('proíbe explicitamente prometer aprovação e incentivar fraude/burla (pedido novo do fundador, ausente em v1)', () => {
    const prompt = PROMPT_VERSIONS.v2.systemPrompt;
    expect(prompt).toMatch(/nunca prometa aprovação/i);
    expect(prompt).toMatch(/nunca incentive.*burlar/i);
    expect(PROMPT_VERSIONS.v1.systemPrompt).not.toMatch(/nunca prometa aprovação/i);
  });

  it('mantém a regra de nunca inventar preço/prazo e de escalar quando não souber (herdada de v1)', () => {
    const prompt = PROMPT_VERSIONS.v2.systemPrompt;
    expect(prompt).toMatch(/nunca invente preço, prazo/i);
    expect(prompt).toMatch(/encaminhar a conversa para um.*atendente humano/i);
  });

  it('instrui brevidade (mensagens curtas, estilo WhatsApp)', () => {
    expect(PROMPT_VERSIONS.v2.systemPrompt).toMatch(/mensagens curtas/i);
  });

  it('preserva a instrução de mídia IDÊNTICA a v1', () => {
    const mediaSentence = 'nunca finja saber o conteúdo desse arquivo nem invente o que ele mostra';
    expect(PROMPT_VERSIONS.v1.systemPrompt).toContain(mediaSentence);
    expect(PROMPT_VERSIONS.v2.systemPrompt).toContain(mediaSentence);
  });

  it('preserva os DOIS marcadores técnicos (estágio + escalonamento) com o MESMO formato de v1 — crítico para Pipeline/escalonamento continuarem funcionando', () => {
    for (const prompt of [PROMPT_VERSIONS.v1.systemPrompt, PROMPT_VERSIONS.v2.systemPrompt]) {
      expect(prompt).toContain(`${STAGE_MARKER_PREFIX}NEW`);
      expect(prompt).toContain(`${STAGE_MARKER_PREFIX}NEGOTIATING`);
      expect(prompt).toContain(ESCALATION_MARKER_UNKNOWN_ANSWER);
      expect(prompt).toContain(ESCALATION_MARKER_REQUESTED_HUMAN);
    }
  });

  it('o bloco de marcadores é TEXTUALMENTE idêntico entre v1 e v2 (mesma constante compartilhada, sem drift)', () => {
    const markerStart = 'INSTRUÇÃO OBRIGATÓRIA sobre marcadores internos';
    const v1MarkerBlock = PROMPT_VERSIONS.v1.systemPrompt.slice(
      PROMPT_VERSIONS.v1.systemPrompt.indexOf(markerStart),
    );
    const v2MarkerBlock = PROMPT_VERSIONS.v2.systemPrompt.slice(
      PROMPT_VERSIONS.v2.systemPrompt.indexOf(markerStart),
    );
    expect(v1MarkerBlock).toBe(v2MarkerBlock);
  });
});
