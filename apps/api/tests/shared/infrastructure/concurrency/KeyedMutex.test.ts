import { KeyedMutex } from '../../../../src/shared/infrastructure/concurrency/KeyedMutex';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('KeyedMutex', () => {
  it('serializa duas execuções para a MESMA chave — a segunda só começa quando a primeira termina', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];
    const first = deferred<void>();

    const runA = mutex.run('conversation-1', async () => {
      order.push('A-start');
      await first.promise;
      order.push('A-end');
    });

    // Dá um "tick" para garantir que A já começou antes de agendar B.
    await Promise.resolve();
    const runB = mutex.run('conversation-1', async () => {
      order.push('B-start');
    });

    // B não pode ter começado ainda — A não terminou.
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['A-start']);

    first.resolve();
    await runA;
    await runB;

    expect(order).toEqual(['A-start', 'A-end', 'B-start']);
  });

  it('roda em PARALELO para chaves diferentes — nenhuma espera a outra', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];
    const barrierA = deferred<void>();
    const barrierB = deferred<void>();

    const runA = mutex.run('conversation-1', async () => {
      order.push('A-start');
      await barrierA.promise;
      order.push('A-end');
    });
    const runB = mutex.run('conversation-2', async () => {
      order.push('B-start');
      await barrierB.promise;
      order.push('B-end');
    });

    // As duas devem ter iniciado ANTES de qualquer uma terminar —
    // prova de que uma chave diferente não espera a outra.
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['A-start', 'B-start']);

    barrierB.resolve();
    await runB;
    barrierA.resolve();
    await runA;

    expect(order).toEqual(['A-start', 'B-start', 'B-end', 'A-end']);
  });

  it('uma falha na primeira execução não bloqueia a segunda da mesma chave, e o erro chega a quem chamou a primeira', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];

    const runA = mutex
      .run('conversation-1', async () => {
        order.push('A');
        throw new Error('falha simulada da IA');
      })
      .catch((error: Error) => error.message);

    const runB = mutex.run('conversation-1', async () => {
      order.push('B');
    });

    await expect(runA).resolves.toBe('falha simulada da IA');
    await runB;
    expect(order).toEqual(['A', 'B']);
  });

  it('não deixa entradas penduradas no Map depois que a fila de uma chave esvazia (sem vazamento de memória)', async () => {
    const mutex = new KeyedMutex();
    await mutex.run('conversation-1', async () => undefined);
    // Acesso via cast só para inspecionar o estado interno em teste.
    const tails = (mutex as unknown as { tails: Map<string, unknown> }).tails;
    expect(tails.size).toBe(0);
  });

  it('preserva o valor de retorno de fn', async () => {
    const mutex = new KeyedMutex();
    const result = await mutex.run('k', async () => 42);
    expect(result).toBe(42);
  });
});
