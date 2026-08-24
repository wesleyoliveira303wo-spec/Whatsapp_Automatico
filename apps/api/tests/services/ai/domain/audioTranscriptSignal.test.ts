import {
  extractAudioTranscript,
  AUDIO_TRANSCRIPT_MARKER_PREFIX,
  AUDIO_TRANSCRIPT_MARKER_SUFFIX,
} from '../../../../src/services/ai/domain/audioTranscriptSignal';

describe('extractAudioTranscript', () => {
  it('devolve o conteúdo inalterado e transcript=undefined quando não há marcador', () => {
    const result = extractAudioTranscript('Oi, tudo bem?');
    expect(result).toEqual({ content: 'Oi, tudo bem?' });
  });

  it('extrai a transcrição e remove o marcador do conteúdo visível', () => {
    const raw =
      'Entendi! Você quer o site com carrinho de compras.\n' +
      `${AUDIO_TRANSCRIPT_MARKER_PREFIX}Oi, eu queria um site com carrinho de compras pra minha loja${AUDIO_TRANSCRIPT_MARKER_SUFFIX}`;
    const result = extractAudioTranscript(raw);
    expect(result.transcript).toBe('Oi, eu queria um site com carrinho de compras pra minha loja');
    expect(result.content).toBe('Entendi! Você quer o site com carrinho de compras.');
  });

  it('remove só o PRIMEIRO marcador, mesmo com múltiplas ocorrências (o modelo não deveria repetir)', () => {
    const raw =
      `${AUDIO_TRANSCRIPT_MARKER_PREFIX}primeira${AUDIO_TRANSCRIPT_MARKER_SUFFIX}\n` +
      `resto da resposta\n` +
      `${AUDIO_TRANSCRIPT_MARKER_PREFIX}segunda${AUDIO_TRANSCRIPT_MARKER_SUFFIX}`;
    const result = extractAudioTranscript(raw);
    expect(result.transcript).toBe('primeira');
    // O segundo marcador (não-primeiro) permanece — comportamento aceito,
    // mesmo espírito de extractStage (só o primeiro valor importa).
    expect(result.content).toContain(AUDIO_TRANSCRIPT_MARKER_PREFIX);
  });

  it('marcador vazio devolve transcript=undefined (degradação graciosa, não uma transcrição vazia)', () => {
    const raw = `Recebi seu áudio.\n${AUDIO_TRANSCRIPT_MARKER_PREFIX}${AUDIO_TRANSCRIPT_MARKER_SUFFIX}`;
    const result = extractAudioTranscript(raw);
    expect(result.transcript).toBeUndefined();
    expect(result.content).toBe('Recebi seu áudio.');
  });

  it('apara espaços em volta da transcrição capturada', () => {
    const raw = `${AUDIO_TRANSCRIPT_MARKER_PREFIX}   texto com espaços   ${AUDIO_TRANSCRIPT_MARKER_SUFFIX}`;
    const result = extractAudioTranscript(raw);
    expect(result.transcript).toBe('texto com espaços');
  });

  it('colapsa linhas em branco sobrando após remover o marcador (mesma limpeza de extractStage/extractEscalation)', () => {
    const raw =
      'Primeira parte da resposta.\n\n\n' +
      `${AUDIO_TRANSCRIPT_MARKER_PREFIX}o que a pessoa disse${AUDIO_TRANSCRIPT_MARKER_SUFFIX}\n\n\n` +
      'Segunda parte da resposta.';
    const result = extractAudioTranscript(raw);
    expect(result.content).not.toMatch(/\n{3,}/);
  });

  it('funciona junto de outros marcadores no mesmo texto (extração é independente, não precisa rodar por último)', () => {
    const raw =
      'Fechamos por R$ 990.\n' +
      `${AUDIO_TRANSCRIPT_MARKER_PREFIX}quero saber o preço do site${AUDIO_TRANSCRIPT_MARKER_SUFFIX}\n` +
      '[[ESTAGIO:NEGOTIATING]]';
    const result = extractAudioTranscript(raw);
    expect(result.transcript).toBe('quero saber o preço do site');
    expect(result.content).toContain('[[ESTAGIO:NEGOTIATING]]');
    expect(result.content).toContain('Fechamos por R$ 990.');
  });

  it('captura texto multi-linha dentro do marcador (a fala transcrita pode ter quebras)', () => {
    const raw = `${AUDIO_TRANSCRIPT_MARKER_PREFIX}oi tudo bem\neu queria saber o preço${AUDIO_TRANSCRIPT_MARKER_SUFFIX}`;
    const result = extractAudioTranscript(raw);
    expect(result.transcript).toBe('oi tudo bem\neu queria saber o preço');
  });
});
