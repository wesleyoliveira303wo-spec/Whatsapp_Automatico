import { AuthenticationCreds, AuthenticationState, BufferJSON, SignalDataTypeMap, initAuthCreds } from '@whiskeysockets/baileys';

import { CredentialsStore } from '../../../../../shared/security/domain/CredentialsStore';

/**
 * Adapta o port genérico `CredentialsStore` (`shared/security/domain`) para
 * o formato `AuthenticationState` exigido pelo Baileys (`creds` + `keys`,
 * este último um key-value store do protocolo Signal com leitura/escrita por
 * chave individual — não um blob único).
 *
 * Este é exatamente o limite que a revisão arquitetural do M1A.6 (ver
 * DECISIONS.md ADR #21) determinou: o formato específico do Baileys
 * (`SignalDataTypeMap`, `get(type, ids)`/`set(data)`) fica inteiramente
 * aqui, na Infrastructure — o Domain (`CredentialsStore`) nunca soube nem
 * precisa saber que Baileys existe.
 *
 * Convenção de chaves dentro do namespace: `"creds"` para as credenciais
 * principais (reescritas por inteiro a cada `creds.update`, como o próprio
 * Baileys espera) e `"key:<type>:<id>"` para cada entrada do Signal key
 * store (lida/escrita individualmente, nunca em bloco — evita o problema de
 * performance/concorrência que motivou rejeitar um blob único, ver ADR #21).
 *
 * NOTA DE VERIFICAÇÃO: assim como `PrismaCredentialsStore`, este arquivo
 * importa tipos/funções de `@whiskeysockets/baileys` (`AuthenticationCreds`,
 * `AuthenticationState`, `BufferJSON`, `SignalDataTypeMap`, `initAuthCreds`)
 * que não puderam ser conferidos contra a biblioteca real neste sandbox (sem
 * shell para `npm install`/`tsc`). A forma usada aqui segue a convenção
 * pública mais comum para auth stores customizados do Baileys (o mesmo
 * padrão usado por `useMultiFileAuthState` e por adapters da comunidade para
 * Mongo/Redis/Postgres), mas precisa ser conferida com `tsc` no ambiente
 * real antes do primeiro uso — e o nome/versão exata do pacote
 * (`@whiskeysockets/baileys`) deve ser confirmado pelo usuário ao instalar,
 * já que forks e renomeações de pacote são comuns neste ecossistema.
 */
function buildKeyId(type: string, id: string): string {
  return `key:${type}:${id}`;
}

export async function useCredentialsStoreAuthState(
  credentialsStore: CredentialsStore,
  tenantId: string,
  namespace: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const storedCreds = await credentialsStore.get(tenantId, namespace, 'creds');
  const creds: AuthenticationCreds = storedCreds
    ? (JSON.parse(storedCreds, BufferJSON.reviver) as AuthenticationCreds)
    : initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(
          type: T,
          ids: string[],
        ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
          const result: { [id: string]: SignalDataTypeMap[T] } = {};

          await Promise.all(
            ids.map(async (id) => {
              const raw = await credentialsStore.get(tenantId, namespace, buildKeyId(type as string, id));
              if (raw) {
                result[id] = JSON.parse(raw, BufferJSON.reviver) as SignalDataTypeMap[T];
              }
            }),
          );

          return result;
        },
        set: async (data: { [T in keyof SignalDataTypeMap]?: { [id: string]: SignalDataTypeMap[T] | null } }): Promise<void> => {
          const tasks: Promise<void>[] = [];

          for (const type of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
            const entries = data[type];
            if (!entries) {
              continue;
            }

            for (const id of Object.keys(entries)) {
              const value = entries[id];
              const key = buildKeyId(type as string, id);

              tasks.push(
                value
                  ? credentialsStore.set(tenantId, namespace, key, JSON.stringify(value, BufferJSON.replacer))
                  : credentialsStore.remove(tenantId, namespace, key),
              );
            }
          }

          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async (): Promise<void> => {
      await credentialsStore.set(tenantId, namespace, 'creds', JSON.stringify(creds, BufferJSON.replacer));
    },
  };
}
