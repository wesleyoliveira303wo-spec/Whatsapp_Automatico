import {
  sniffMediaCategory,
  isDeclaredMediaCategoryImplausible,
} from '../../../../src/services/conversations/domain/mediaMagicBytes';

describe('sniffMediaCategory (Fase 1, Bloco F1.10)', () => {
  it('reconhece JPEG, PNG, GIF, WEBP e BMP como image', () => {
    expect(sniffMediaCategory(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image'); // JPEG
    expect(sniffMediaCategory(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'image',
    ); // PNG
    expect(sniffMediaCategory(Buffer.from('GIF89a...'))).toBe('image');
    expect(sniffMediaCategory(Buffer.from([0x42, 0x4d, 0x00, 0x00]))).toBe('image'); // BMP
    const webp = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('WEBP'),
    ]);
    expect(sniffMediaCategory(webp)).toBe('image');
  });

  it('reconhece OGG, MP3 e WAV como audio', () => {
    expect(sniffMediaCategory(Buffer.from('OggS....'))).toBe('audio');
    expect(sniffMediaCategory(Buffer.from('ID3....'))).toBe('audio');
    expect(sniffMediaCategory(Buffer.from([0xff, 0xfb, 0x90, 0x00]))).toBe('audio');
    const wav = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('WAVE'),
    ]);
    expect(sniffMediaCategory(wav)).toBe('audio');
  });

  it('reconhece MP4/MOV (ftyp) e WEBM/MKV (EBML) como video', () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42')]);
    expect(sniffMediaCategory(mp4)).toBe('video');
    expect(sniffMediaCategory(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))).toBe('video');
  });

  it('devolve null para PDF, texto puro, ou buffer curto demais (documento não tem assinatura forte)', () => {
    expect(sniffMediaCategory(Buffer.from('%PDF-1.4...'))).toBeNull();
    expect(sniffMediaCategory(Buffer.from('conteudo qualquer de texto'))).toBeNull();
    expect(sniffMediaCategory(Buffer.from([0x01]))).toBeNull();
    expect(sniffMediaCategory(Buffer.alloc(0))).toBeNull();
  });
});

describe('isDeclaredMediaCategoryImplausible (Fase 1, Bloco F1.10)', () => {
  it('false quando a assinatura bate com a categoria declarada', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(isDeclaredMediaCategoryImplausible('image', jpeg)).toBe(false);
  });

  it('true quando a assinatura é FORTE e diverge da categoria declarada', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(isDeclaredMediaCategoryImplausible('document', jpeg)).toBe(true);
    expect(isDeclaredMediaCategoryImplausible('audio', jpeg)).toBe(true);
    expect(isDeclaredMediaCategoryImplausible('video', jpeg)).toBe(true);
  });

  it('false quando a categoria é desconhecida (documento real, texto, PDF) — nunca bloqueia por falta de reconhecimento', () => {
    expect(isDeclaredMediaCategoryImplausible('document', Buffer.from('%PDF-1.4...'))).toBe(false);
    expect(isDeclaredMediaCategoryImplausible('document', Buffer.from('conteudo qualquer'))).toBe(
      false,
    );
  });
});
