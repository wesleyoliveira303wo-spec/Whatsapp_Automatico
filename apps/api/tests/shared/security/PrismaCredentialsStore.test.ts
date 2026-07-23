import { Cipher } from '../../../src/shared/security/domain/Cipher';
import { PrismaCredentialsStore } from '../../../src/shared/security/infrastructure/PrismaCredentialsStore';

/**
 * Fake mínimo do formato relevante do Prisma Client — não depende do client
 * gerado (ver nota de verificação em `PrismaCredentialsStore.ts`). Cobre
 * apenas o shape usado por esta classe (`tenantCredential.{findUnique,
 * findMany,upsert,deleteMany}`).
 */
function createFakePrisma(): {
  tenantCredential: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    upsert: jest.Mock;
    deleteMany: jest.Mock;
  };
} {
  return {
    tenantCredential: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

/** Fake `Cipher` identidade-com-marcador, só para observar o que a store envia/recebe. */
function createFakeCipher(): Cipher {
  return {
    encrypt: (tenantId: string, plainText: string) => `enc(${tenantId}):${plainText}`,
    decrypt: (_tenantId: string, cipherText: string) => cipherText.replace(/^enc\([^)]*\):/, ''),
  };
}

describe('PrismaCredentialsStore', () => {
  it('get() deve retornar null quando a chave não existe', async () => {
    const prisma = createFakePrisma();
    prisma.tenantCredential.findUnique.mockResolvedValue(null);
    const store = new PrismaCredentialsStore(prisma as never, createFakeCipher());

    const result = await store.get('tenant-1', 'whatsapp:session:default', 'creds');

    expect(result).toBeNull();
  });

  it('get() deve decriptar o valor encontrado', async () => {
    const prisma = createFakePrisma();
    prisma.tenantCredential.findUnique.mockResolvedValue({ value: 'enc(tenant-1):valor-plano' });
    const store = new PrismaCredentialsStore(prisma as never, createFakeCipher());

    const result = await store.get('tenant-1', 'whatsapp:session:default', 'creds');

    expect(result).toBe('valor-plano');
    expect(prisma.tenantCredential.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_namespace_key: {
          tenantId: 'tenant-1',
          namespace: 'whatsapp:session:default',
          key: 'creds',
        },
      },
    });
  });

  it('getAll() deve decriptar todas as chaves do namespace', async () => {
    const prisma = createFakePrisma();
    prisma.tenantCredential.findMany.mockResolvedValue([
      { key: 'creds', value: 'enc(tenant-1):valor-1' },
      { key: 'signal-key-1', value: 'enc(tenant-1):valor-2' },
    ]);
    const store = new PrismaCredentialsStore(prisma as never, createFakeCipher());

    const result = await store.getAll('tenant-1', 'whatsapp:session:default');

    expect(result).toEqual({ creds: 'valor-1', 'signal-key-1': 'valor-2' });
  });

  it('set() deve encriptar o valor e fazer upsert', async () => {
    const prisma = createFakePrisma();
    const store = new PrismaCredentialsStore(prisma as never, createFakeCipher());

    await store.set('tenant-1', 'whatsapp:session:default', 'creds', 'valor-plano');

    expect(prisma.tenantCredential.upsert).toHaveBeenCalledWith({
      where: {
        tenantId_namespace_key: {
          tenantId: 'tenant-1',
          namespace: 'whatsapp:session:default',
          key: 'creds',
        },
      },
      create: {
        tenantId: 'tenant-1',
        namespace: 'whatsapp:session:default',
        key: 'creds',
        value: 'enc(tenant-1):valor-plano',
      },
      update: { value: 'enc(tenant-1):valor-plano' },
    });
  });

  it('remove() deve usar deleteMany (idempotente, não lança se a chave não existir)', async () => {
    const prisma = createFakePrisma();
    const store = new PrismaCredentialsStore(prisma as never, createFakeCipher());

    await store.remove('tenant-1', 'whatsapp:session:default', 'creds');

    expect(prisma.tenantCredential.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', namespace: 'whatsapp:session:default', key: 'creds' },
    });
  });

  it('clear() deve remover todas as chaves do namespace', async () => {
    const prisma = createFakePrisma();
    const store = new PrismaCredentialsStore(prisma as never, createFakeCipher());

    await store.clear('tenant-1', 'whatsapp:session:default');

    expect(prisma.tenantCredential.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', namespace: 'whatsapp:session:default' },
    });
  });
});
