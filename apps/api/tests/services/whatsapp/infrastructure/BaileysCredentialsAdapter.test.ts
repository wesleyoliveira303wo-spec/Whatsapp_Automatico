import { CredentialsStore } from '../../../../src/shared/security/domain/CredentialsStore';

/**
 * Mock "virtual" de `@whiskeysockets/baileys` — o pacote real não está
 * instalado neste sandbox (sem shell para `npm install`), mas
 * `{ virtual: true }` permite ao Jest simular o módulo mesmo sem ele existir
 * em disco, isolando o teste da disponibilidade real da dependência. Cobre
 * apenas o shape usado por `BaileysCredentialsAdapter.ts`
 * (`BufferJSON.replacer/reviver`, `initAuthCreds`).
 */
jest.mock(
  '@whiskeysockets/baileys',
  () => ({
    __esModule: true,
    BufferJSON: {
      replacer: (_key: string, value: unknown) => value,
      reviver: (_key: string, value: unknown) => value,
    },
    initAuthCreds: () => ({ noiseKey: 'default-creds' }),
  }),
  { virtual: true },
);

import { useCredentialsStoreAuthState } from '../../../../src/services/whatsapp/infrastructure/providers/baileys/BaileysCredentialsAdapter';

/** Fake em memória de `CredentialsStore`, sem Prisma/Postgres. */
function createFakeCredentialsStore(): CredentialsStore {
  const data = new Map<string, string>();
  const compositeKey = (tenantId: string, namespace: string, key: string): string =>
    `${tenantId}::${namespace}::${key}`;

  return {
    get: async (tenantId, namespace, key) =>
      data.get(compositeKey(tenantId, namespace, key)) ?? null,
    getAll: async (tenantId, namespace) => {
      const prefix = `${tenantId}::${namespace}::`;
      const result: Record<string, string> = {};
      for (const [k, v] of data.entries()) {
        if (k.startsWith(prefix)) {
          result[k.slice(prefix.length)] = v;
        }
      }
      return result;
    },
    set: async (tenantId, namespace, key, value) => {
      data.set(compositeKey(tenantId, namespace, key), value);
    },
    remove: async (tenantId, namespace, key) => {
      data.delete(compositeKey(tenantId, namespace, key));
    },
    clear: async (tenantId, namespace) => {
      const prefix = `${tenantId}::${namespace}::`;
      for (const k of Array.from(data.keys())) {
        if (k.startsWith(prefix)) {
          data.delete(k);
        }
      }
    },
  };
}

describe('useCredentialsStoreAuthState', () => {
  const TENANT_ID = 'tenant-1';
  const NAMESPACE = 'whatsapp:session:default';

  it('deve usar initAuthCreds() quando não há creds salvas ainda', async () => {
    const store = createFakeCredentialsStore();

    const { state } = await useCredentialsStoreAuthState(store, TENANT_ID, NAMESPACE);

    expect(state.creds).toEqual({ noiseKey: 'default-creds' });
  });

  it('deve carregar creds previamente salvas em vez de gerar novas', async () => {
    const store = createFakeCredentialsStore();
    await store.set(
      TENANT_ID,
      NAMESPACE,
      'creds',
      JSON.stringify({ noiseKey: 'creds-existentes' }),
    );

    const { state } = await useCredentialsStoreAuthState(store, TENANT_ID, NAMESPACE);

    expect(state.creds).toEqual({ noiseKey: 'creds-existentes' });
  });

  it('saveCreds() deve persistir o objeto `creds` atual via CredentialsStore', async () => {
    const store = createFakeCredentialsStore();
    const { saveCreds } = await useCredentialsStoreAuthState(store, TENANT_ID, NAMESPACE);

    await saveCreds();

    const persisted = await store.get(TENANT_ID, NAMESPACE, 'creds');
    expect(persisted).toBe(JSON.stringify({ noiseKey: 'default-creds' }));
  });

  it('keys.set() e keys.get() devem fazer round-trip de uma entrada do Signal key store', async () => {
    const store = createFakeCredentialsStore();
    const { state } = await useCredentialsStoreAuthState(store, TENANT_ID, NAMESPACE);

    await state.keys.set({ 'pre-key': { '1': { keyPair: 'valor-fake' } } } as never);
    const result = await state.keys.get('pre-key' as never, ['1']);

    expect(result).toEqual({ '1': { keyPair: 'valor-fake' } });
  });

  it('keys.set() com valor null deve remover a chave (poda do Baileys)', async () => {
    const store = createFakeCredentialsStore();
    const { state } = await useCredentialsStoreAuthState(store, TENANT_ID, NAMESPACE);

    await state.keys.set({ 'pre-key': { '1': { keyPair: 'valor-fake' } } } as never);
    await state.keys.set({ 'pre-key': { '1': null } } as never);
    const result = await state.keys.get('pre-key' as never, ['1']);

    expect(result).toEqual({});
  });

  it('keys.get() para uma chave inexistente não deve incluir essa entrada no resultado', async () => {
    const store = createFakeCredentialsStore();
    const { state } = await useCredentialsStoreAuthState(store, TENANT_ID, NAMESPACE);

    const result = await state.keys.get('pre-key' as never, ['chave-nunca-salva']);

    expect(result).toEqual({});
  });
});
