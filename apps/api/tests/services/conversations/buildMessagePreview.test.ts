import { buildMessagePreview } from '../../../src/services/conversations/domain/policies/buildMessagePreview';

describe('buildMessagePreview (Fase 1, Bloco F1.7)', () => {
  it('texto simples: devolve o conteúdo aparado', () => {
    expect(buildMessagePreview({ content: '  Olá, tudo bem?  ', contentType: 'text' })).toBe(
      'Olá, tudo bem?',
    );
  });

  it('texto com quebras de linha: colapsa em uma única linha', () => {
    expect(
      buildMessagePreview({ content: 'Linha 1\nLinha 2\n\nLinha 3', contentType: 'text' }),
    ).toBe('Linha 1 Linha 2 Linha 3');
  });

  it('texto muito longo: trunca com reticências', () => {
    const longText = 'a'.repeat(200);
    const preview = buildMessagePreview({ content: longText, contentType: 'text' });
    expect(preview.length).toBe(120);
    expect(preview.endsWith('…')).toBe(true);
  });

  it('mídia sem legenda: usa o rótulo textual do tipo', () => {
    expect(buildMessagePreview({ content: '', contentType: 'image' })).toBe('📷 Imagem');
    expect(buildMessagePreview({ content: '', contentType: 'audio' })).toBe('🎤 Áudio');
    expect(buildMessagePreview({ content: '', contentType: 'video' })).toBe('🎥 Vídeo');
    expect(buildMessagePreview({ content: '', contentType: 'document' })).toBe('📄 Documento');
    expect(buildMessagePreview({ content: '', contentType: 'sticker' })).toBe('🌟 Figurinha');
  });

  it('mídia com legenda: rótulo seguido da legenda', () => {
    expect(buildMessagePreview({ content: 'Confira essa promoção', contentType: 'image' })).toBe(
      '📷 Imagem Confira essa promoção',
    );
  });

  it('mídia enviada pelo operador com content vazio (string, não undefined): usa o rótulo', () => {
    expect(buildMessagePreview({ content: '   ', contentType: 'document' })).toBe('📄 Documento');
  });
});
