import { AgentMediaCache } from '../../../../src/services/conversations/infrastructure/AgentMediaCache';

describe('AgentMediaCache (Fase 1, Bloco F1.3)', () => {
  it('devolve undefined para uma entrada nunca gravada', () => {
    const cache = new AgentMediaCache();

    expect(cache.get('m1')).toBeUndefined();
  });

  it('grava e devolve o binário/metadados exatos', () => {
    const cache = new AgentMediaCache();

    cache.set('m1', { mimeType: 'image/jpeg', fileName: 'foto.jpg', data: Buffer.from('bytes') });

    expect(cache.get('m1')).toEqual({
      mimeType: 'image/jpeg',
      fileName: 'foto.jpg',
      data: Buffer.from('bytes'),
    });
  });

  it('fileName é opcional', () => {
    const cache = new AgentMediaCache();

    cache.set('m1', { mimeType: 'audio/ogg', data: Buffer.from('bytes') });

    expect(cache.get('m1')).toEqual({
      mimeType: 'audio/ogg',
      fileName: undefined,
      data: Buffer.from('bytes'),
    });
  });

  it('expira após o TTL configurado — devolve undefined e remove a entrada', () => {
    const cache = new AgentMediaCache(1000);
    const realNow = Date.now;
    let currentTime = 1_000_000;
    Date.now = () => currentTime;

    try {
      cache.set('m1', { mimeType: 'image/jpeg', data: Buffer.from('bytes') });
      expect(cache.get('m1')).toBeDefined();

      currentTime += 1001;
      expect(cache.get('m1')).toBeUndefined();
      // Confirma que a entrada foi REMOVIDA (não só ignorada) — uma segunda
      // leitura não deveria reencontrar por acidente.
      expect(cache.get('m1')).toBeUndefined();
    } finally {
      Date.now = realNow;
    }
  });

  it('não expira antes do TTL', () => {
    const cache = new AgentMediaCache(1000);
    const realNow = Date.now;
    let currentTime = 1_000_000;
    Date.now = () => currentTime;

    try {
      cache.set('m1', { mimeType: 'image/jpeg', data: Buffer.from('bytes') });
      currentTime += 999;
      expect(cache.get('m1')).toBeDefined();
    } finally {
      Date.now = realNow;
    }
  });

  it('respeita o teto de entradas: descarta a mais antiga ao exceder maxEntries', () => {
    const cache = new AgentMediaCache(60_000, 2);

    cache.set('m1', { mimeType: 'image/jpeg', data: Buffer.from('1') });
    cache.set('m2', { mimeType: 'image/jpeg', data: Buffer.from('2') });
    cache.set('m3', { mimeType: 'image/jpeg', data: Buffer.from('3') });

    expect(cache.get('m1')).toBeUndefined();
    expect(cache.get('m2')).toBeDefined();
    expect(cache.get('m3')).toBeDefined();
  });
});
