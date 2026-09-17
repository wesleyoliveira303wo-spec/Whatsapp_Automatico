import { buildJobId } from '../../../../src/shared/infrastructure/queue/jobId';

describe('buildJobId', () => {
  it('une as partes com "-"', () => {
    expect(buildJobId('reply', 'tenant-1', 'conversa-1', 'mensagem-1')).toBe(
      'reply-tenant-1-conversa-1-mensagem-1',
    );
  });

  // O motivo de a função existir: o BullMQ lança em `queue.add()` quando o
  // `jobId` tem `:` e não tem exatamente 3 partes, e essa exceção some no
  // caminho de quem chamou (incidente do balão único, 2026-08-21).
  it('nunca devolve uma chave com ":", mesmo com ":" dentro de uma parte', () => {
    const jobId = buildJobId('reply', 'tenant:a', 'conversa:b', 'mensagem:c');

    expect(jobId).not.toContain(':');
  });

  it('mantém partes distintas distintas depois da troca', () => {
    expect(buildJobId('reply', 'a:b')).not.toBe(buildJobId('reply', 'a:c'));
  });
});
