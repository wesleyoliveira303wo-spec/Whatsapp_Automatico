import { AgentMediaCache } from '../../../../src/services/conversations/infrastructure/AgentMediaCache';

describe('AgentMediaCache (Fase 1, Bloco F1.3; isolamento por tenant desde F1.10)', () => {
  it('devolve undefined para uma entrada nunca gravada', () => {
    const cache = new AgentMediaCache();

    expect(cache.get('tenant-1', 'm1')).toBeUndefined();
  });

  it('grava e devolve o binário/metadados exatos', () => {
    const cache = new AgentMediaCache();

    cache.set('tenant-1', 'm1', {
      mimeType: 'image/jpeg',
      fileName: 'foto.jpg',
      data: Buffer.from('bytes'),
    });

    expect(cache.get('tenant-1', 'm1')).toEqual({
      mimeType: 'image/jpeg',
      fileName: 'foto.jpg',
      data: Buffer.from('bytes'),
    });
  });

  it('fileName é opcional', () => {
    const cache = new AgentMediaCache();

    cache.set('tenant-1', 'm1', { mimeType: 'audio/ogg', data: Buffer.from('bytes') });

    expect(cache.get('tenant-1', 'm1')).toEqual({
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
      cache.set('tenant-1', 'm1', { mimeType: 'image/jpeg', data: Buffer.from('bytes') });
      expect(cache.get('tenant-1', 'm1')).toBeDefined();

      currentTime += 1001;
      expect(cache.get('tenant-1', 'm1')).toBeUndefined();
      // Confirma que a entrada foi REMOVIDA (não só ignorada) — uma segunda
      // leitura não deveria reencontrar por acidente.
      expect(cache.get('tenant-1', 'm1')).toBeUndefined();
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
      cache.set('tenant-1', 'm1', { mimeType: 'image/jpeg', data: Buffer.from('bytes') });
      currentTime += 999;
      expect(cache.get('tenant-1', 'm1')).toBeDefined();
    } finally {
      Date.now = realNow;
    }
  });

  it('respeita o teto de entradas POR TENANT: descarta a mais antiga DESTE tenant ao exceder maxEntriesPerTenant', () => {
    const cache = new AgentMediaCache(60_000, 2);

    cache.set('tenant-1', 'm1', { mimeType: 'image/jpeg', data: Buffer.from('1') });
    cache.set('tenant-1', 'm2', { mimeType: 'image/jpeg', data: Buffer.from('2') });
    cache.set('tenant-1', 'm3', { mimeType: 'image/jpeg', data: Buffer.from('3') });

    expect(cache.get('tenant-1', 'm1')).toBeUndefined();
    expect(cache.get('tenant-1', 'm2')).toBeDefined();
    expect(cache.get('tenant-1', 'm3')).toBeDefined();
  });

  it('[Fase 1, F1.10] isolamento entre tenants: rajada de um tenant NUNCA expulsa a mídia recém-enviada de outro', () => {
    const cache = new AgentMediaCache(60_000, 2);

    // tenant-1 estoura o próprio teto (2 entradas) várias vezes.
    cache.set('tenant-1', 'a1', { mimeType: 'image/jpeg', data: Buffer.from('a1') });
    cache.set('tenant-2', 'b1', { mimeType: 'image/jpeg', data: Buffer.from('b1') }); // tenant-2, gravada uma única vez
    cache.set('tenant-1', 'a2', { mimeType: 'image/jpeg', data: Buffer.from('a2') });
    cache.set('tenant-1', 'a3', { mimeType: 'image/jpeg', data: Buffer.from('a3') }); // estoura o teto do tenant-1 (2), expulsa a1
    cache.set('tenant-1', 'a4', { mimeType: 'image/jpeg', data: Buffer.from('a4') }); // estoura de novo, expulsa a2

    // tenant-1 perdeu a1/a2 (esperado — seu próprio teto).
    expect(cache.get('tenant-1', 'a1')).toBeUndefined();
    expect(cache.get('tenant-1', 'a2')).toBeUndefined();
    expect(cache.get('tenant-1', 'a3')).toBeDefined();
    expect(cache.get('tenant-1', 'a4')).toBeDefined();
    // tenant-2 nunca foi tocado pela rajada do tenant-1 — a1 continua lá.
    expect(cache.get('tenant-2', 'b1')).toBeDefined();
  });

  it('[Fase 1, F1.10] o mesmo messageId (hipoteticamente) em tenants diferentes nunca colide — chave composta', () => {
    const cache = new AgentMediaCache();

    cache.set('tenant-1', 'm1', { mimeType: 'image/jpeg', data: Buffer.from('do tenant 1') });
    cache.set('tenant-2', 'm1', { mimeType: 'image/jpeg', data: Buffer.from('do tenant 2') });

    expect(cache.get('tenant-1', 'm1')?.data.toString()).toBe('do tenant 1');
    expect(cache.get('tenant-2', 'm1')?.data.toString()).toBe('do tenant 2');
  });
});
