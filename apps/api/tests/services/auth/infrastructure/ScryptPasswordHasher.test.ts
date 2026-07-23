import { ScryptPasswordHasher } from '../../../../src/services/auth/infrastructure/ScryptPasswordHasher';

describe('ScryptPasswordHasher (Milestone 5, Bloco M5B)', () => {
  const hasher = new ScryptPasswordHasher();

  it('gera hash no formato auto-descritivo scrypt:N:r:p:salt:hash', async () => {
    const hash = await hasher.hash('senha-secreta');
    const parts = hash.split(':');
    expect(parts[0]).toBe('scrypt');
    expect(parts).toHaveLength(6);
  });

  it('o hash NUNCA contem a senha em texto plano', async () => {
    const hash = await hasher.hash('senha-secreta');
    expect(hash).not.toContain('senha-secreta');
  });

  it('dois hashes da MESMA senha sao diferentes (sal aleatorio)', async () => {
    const a = await hasher.hash('mesma-senha');
    const b = await hasher.hash('mesma-senha');
    expect(a).not.toBe(b);
  });

  it('verify devolve true para a senha correta', async () => {
    const hash = await hasher.hash('correta');
    expect(await hasher.verify('correta', hash)).toBe(true);
  });

  it('verify devolve false para a senha errada', async () => {
    const hash = await hasher.hash('correta');
    expect(await hasher.verify('errada', hash)).toBe(false);
  });

  it('verify devolve false (nao lanca) para hash malformado', async () => {
    expect(await hasher.verify('x', 'nao-e-um-hash-valido')).toBe(false);
    expect(await hasher.verify('x', 'scrypt:so:tres:partes')).toBe(false);
    expect(await hasher.verify('x', '')).toBe(false);
  });
});
