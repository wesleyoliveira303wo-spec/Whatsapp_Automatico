import {
  ContactAvatarService,
  MAX_CONCURRENT_AVATAR_REFRESHES,
} from '../../../../src/services/whatsapp/application/ContactAvatarService';
import {
  ContactAvatarCacheRecord,
  ContactAvatarCacheRepository,
} from '../../../../src/services/whatsapp/domain/repositories/ContactAvatarCacheRepository';
import {
  ContactAvatarLookup,
  ContactAvatarSource,
} from '../../../../src/services/whatsapp/domain/providers/ContactAvatarSource';
import { Logger } from '../../../../src/shared/domain/Logger';

const TENANT = 'tenant-1';
const SESSION = 'vendas';

function fakeLogger(): Logger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;
}

class FakeCache implements ContactAvatarCacheRepository {
  public readonly rows = new Map<string, ContactAvatarCacheRecord>();
  public readonly upserts: Array<{ contactJid: string; avatarUrl: string | undefined }> = [];

  seed(record: ContactAvatarCacheRecord): void {
    this.rows.set(record.contactJid, record);
  }

  async findManyByContactJids(
    _tenantId: string,
    _sessionName: string,
    contactJids: string[],
  ): Promise<ContactAvatarCacheRecord[]> {
    return contactJids
      .map((jid) => this.rows.get(jid))
      .filter((row): row is ContactAvatarCacheRecord => row !== undefined);
  }

  async upsert(
    _tenantId: string,
    _sessionName: string,
    contactJid: string,
    avatarUrl: string | undefined,
    refreshedAt: Date,
  ): Promise<void> {
    this.upserts.push({ contactJid, avatarUrl });
    this.rows.set(contactJid, { contactJid, avatarUrl, refreshedAt });
  }
}

/** Fonte controlável: cada consulta fica pendente até o teste liberar. */
class ControllableSource implements ContactAvatarSource {
  public readonly calls: string[] = [];
  public concurrentPeak = 0;
  private active = 0;
  private readonly resolvers: Array<(url: string | undefined) => void> = [];

  async lookup(
    _tenantId: string,
    _sessionName: string,
    contactJid: string,
  ): Promise<ContactAvatarLookup> {
    this.calls.push(contactJid);
    this.active += 1;
    this.concurrentPeak = Math.max(this.concurrentPeak, this.active);
    return new Promise<ContactAvatarLookup>((resolve) => {
      this.resolvers.push((url) => {
        this.active -= 1;
        resolve({ checked: true, avatarUrl: url });
      });
    });
  }

  // Sem valor padrão de propósito: `resolveAll(undefined)` com um default
  // ativaria o default (armadilha clássica de parâmetro opcional em JS) e o
  // teste de "sem foto" passaria a resolver COM foto, silenciosamente.
  resolveNext(url: string | undefined): void {
    const resolve = this.resolvers.shift();
    if (resolve) resolve(url);
  }

  resolveAll(url: string | undefined): void {
    while (this.resolvers.length > 0) this.resolveNext(url);
  }
}

/** Deixa as promises pendentes andarem — o refresh é deliberadamente fire-and-forget. */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

/**
 * Bloco B2 (issue #13). O que estes testes protegem, em uma frase: a
 * requisição NUNCA espera pelo WhatsApp, e o WhatsApp NUNCA é consultado sem
 * teto — foi a ausência dessas duas garantias que travou o socket na ADR #78.
 */
describe('ContactAvatarService', () => {
  it('devolve o que está em cache sem esperar por nenhuma consulta ao WhatsApp', async () => {
    const cache = new FakeCache();
    cache.seed({
      contactJid: 'a@s.whatsapp.net',
      avatarUrl: 'https://cdn/a.jpg',
      refreshedAt: new Date(),
    });
    const source = new ControllableSource();
    const service = new ContactAvatarService(cache, source, fakeLogger(), 1, () => new Date(), 0);

    const result = await service.listAvatars(TENANT, SESSION, ['a@s.whatsapp.net']);

    expect(result).toEqual([{ contactJid: 'a@s.whatsapp.net', avatarUrl: 'https://cdn/a.jpg' }]);
    // Entrada fresca: nem sequer agenda atualização.
    expect(source.calls).toEqual([]);
  });

  it('contato desconhecido devolve sem foto NA HORA e agenda a busca em segundo plano', async () => {
    const cache = new FakeCache();
    const source = new ControllableSource();
    const service = new ContactAvatarService(cache, source, fakeLogger(), 1, () => new Date(), 0);

    const result = await service.listAvatars(TENANT, SESSION, ['novo@s.whatsapp.net']);

    // A resposta não esperou: a consulta ainda está pendente neste ponto.
    expect(result).toEqual([{ contactJid: 'novo@s.whatsapp.net', avatarUrl: undefined }]);
    expect(source.calls).toEqual(['novo@s.whatsapp.net']);

    source.resolveAll('https://cdn/novo.jpg');
    await flush();
    expect(cache.upserts).toEqual([
      { contactJid: 'novo@s.whatsapp.net', avatarUrl: 'https://cdn/novo.jpg' },
    ]);
  });

  it('NUNCA passa do teto de consultas simultâneas (a garantia da ADR #78)', async () => {
    const cache = new FakeCache();
    const source = new ControllableSource();
    const service = new ContactAvatarService(cache, source, fakeLogger(), 1, () => new Date(), 0);

    const muitos = Array.from({ length: 30 }, (_, i) => `c${i}@s.whatsapp.net`);
    await service.listAvatars(TENANT, SESSION, muitos);

    expect(source.concurrentPeak).toBe(MAX_CONCURRENT_AVATAR_REFRESHES);
    expect(source.calls).toHaveLength(MAX_CONCURRENT_AVATAR_REFRESHES);

    // Conforme vão terminando, a fila anda — sempre respeitando o teto.
    source.resolveNext('https://cdn/foto.jpg');
    await flush();
    expect(source.concurrentPeak).toBe(MAX_CONCURRENT_AVATAR_REFRESHES);
    expect(source.calls).toHaveLength(MAX_CONCURRENT_AVATAR_REFRESHES + 1);
    // Medido em 2026-09-05: o WhatsApp para de responder quando as fotos são
    // pedidas em rajada, então o teto é UMA por vez, não duas.
    expect(MAX_CONCURRENT_AVATAR_REFRESHES).toBe(1);
  });

  it('grava "sem foto" como registro negativo (é o que impede o bombardeio)', async () => {
    const cache = new FakeCache();
    const source = new ControllableSource();
    const service = new ContactAvatarService(cache, source, fakeLogger(), 1, () => new Date(), 0);

    await service.listAvatars(TENANT, SESSION, ['sem-foto@s.whatsapp.net']);
    source.resolveAll(undefined);
    await flush();

    expect(cache.upserts).toEqual([
      { contactJid: 'sem-foto@s.whatsapp.net', avatarUrl: undefined },
    ]);
    // A linha passa a existir, com URL ausente — distinto de "nunca checamos".
    expect(cache.rows.get('sem-foto@s.whatsapp.net')).toMatchObject({ avatarUrl: undefined });
  });

  it('não enfileira o mesmo contato duas vezes (tela que recarrega em polling)', async () => {
    const cache = new FakeCache();
    const source = new ControllableSource();
    const service = new ContactAvatarService(cache, source, fakeLogger(), 1, () => new Date(), 0);

    await service.listAvatars(TENANT, SESSION, ['a@s.whatsapp.net']);
    await service.listAvatars(TENANT, SESSION, ['a@s.whatsapp.net']);
    await service.listAvatars(TENANT, SESSION, ['a@s.whatsapp.net']);

    expect(source.calls).toEqual(['a@s.whatsapp.net']);
  });

  it('serve o valor VENCIDO na hora e atualiza depois (foto antiga é melhor que nenhuma)', async () => {
    const cache = new FakeCache();
    const antiga = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    cache.seed({
      contactJid: 'a@s.whatsapp.net',
      avatarUrl: 'https://cdn/antiga.jpg',
      refreshedAt: antiga,
    });
    const source = new ControllableSource();
    const service = new ContactAvatarService(cache, source, fakeLogger(), 1, () => new Date(), 0);

    const result = await service.listAvatars(TENANT, SESSION, ['a@s.whatsapp.net']);

    expect(result[0].avatarUrl).toBe('https://cdn/antiga.jpg');
    expect(source.calls).toEqual(['a@s.whatsapp.net']);
  });

  it('falha ao consultar NÃO vira registro negativo (senão fingiria "sem foto" por horas)', async () => {
    const cache = new FakeCache();
    const source: ContactAvatarSource = {
      lookup: jest.fn().mockRejectedValue(new Error('socket caiu')),
    };
    const logger = fakeLogger();
    const service = new ContactAvatarService(cache, source, logger, 1, () => new Date(), 0);

    await service.listAvatars(TENANT, SESSION, ['a@s.whatsapp.net']);
    await flush();

    expect(cache.upserts).toEqual([]);
    expect(logger.debug).toHaveBeenCalled();
  });

  it('sessão fora do ar NÃO vira "sem foto" (senão sumiria a foto de todos por horas)', async () => {
    const cache = new FakeCache();
    // O caso real: logo depois de um reinício o registry está vazio, então
    // nenhuma pergunta chega ao WhatsApp. Gravar isso como registro negativo
    // esconderia TODA foto pelas 6h de validade do "sem foto".
    const source: ContactAvatarSource = {
      lookup: jest.fn().mockResolvedValue({ checked: false, reason: 'session_not_live' }),
    };
    const service = new ContactAvatarService(cache, source, fakeLogger(), 1, () => new Date(), 0);

    await service.listAvatars(TENANT, SESSION, ['a@s.whatsapp.net']);
    await flush();

    expect(source.lookup).toHaveBeenCalled();
    expect(cache.upserts).toEqual([]);
  });

  it('timeout NÃO vira "sem foto" — não grava, e o próximo pedido tenta de novo', async () => {
    const cache = new FakeCache();
    const source: ContactAvatarSource = {
      lookup: jest.fn().mockResolvedValue({ checked: false, reason: 'timeout' }),
    };
    const service = new ContactAvatarService(cache, source, fakeLogger(), 1, () => new Date(), 0);

    await service.listAvatars(TENANT, SESSION, ['a@s.whatsapp.net']);
    await flush();

    // O WhatsApp não respondeu a tempo: isso não diz nada sobre o contato
    // ter foto. Gravar aqui esconderia a foto dele pelas 6h de validade.
    expect(cache.upserts).toEqual([]);
  });

  it('publica o resumo por desfecho quando a fila esvazia (a instrumentação)', async () => {
    const cache = new FakeCache();
    const source = new ControllableSource();
    const logger = fakeLogger();
    const service = new ContactAvatarService(cache, source, logger, 1, () => new Date(), 0);

    await service.listAvatars(TENANT, SESSION, ['a@s.whatsapp.net', 'b@s.whatsapp.net']);
    source.resolveNext('https://cdn/a.jpg');
    await flush();
    source.resolveNext(undefined);
    await flush();

    expect(logger.info).toHaveBeenCalledWith(
      'Atualização de fotos de perfil concluída',
      expect.objectContaining({ total: 2, comFoto: 1, semFoto: 1 }),
    );
  });

  it('deduplica JIDs repetidos no mesmo pedido', async () => {
    const cache = new FakeCache();
    const source = new ControllableSource();
    const service = new ContactAvatarService(cache, source, fakeLogger(), 1, () => new Date(), 0);

    const result = await service.listAvatars(TENANT, SESSION, [
      'a@s.whatsapp.net',
      'a@s.whatsapp.net',
    ]);

    expect(result).toHaveLength(1);
    expect(source.calls).toEqual(['a@s.whatsapp.net']);
  });

  it('pausa a fila depois de vários timeouts seguidos (o WhatsApp calou)', async () => {
    const cache = new FakeCache();
    const source: ContactAvatarSource = {
      lookup: jest.fn().mockResolvedValue({ checked: false, reason: 'timeout' }),
    };
    const logger = fakeLogger();
    const service = new ContactAvatarService(cache, source, logger, 1, () => new Date(), 0);

    const muitos = Array.from({ length: 20 }, (_, i) => `c${i}@s.whatsapp.net`);
    await service.listAvatars(TENANT, SESSION, muitos);
    await flush();

    // Insistir depois que o WhatsApp para de responder só ocupa o socket sem
    // trazer foto nenhuma — a fila recua em vez de queimar as 20 consultas.
    expect((source.lookup as jest.Mock).mock.calls.length).toBeLessThan(muitos.length);
    expect(logger.warn).toHaveBeenCalledWith(
      'WhatsApp parou de responder consultas de foto — pausando a fila',
      expect.objectContaining({ sessionName: SESSION }),
    );
  });

  it('uma resposta boa reinicia a régua de "está calando"', async () => {
    const cache = new FakeCache();
    const source = new ControllableSource();
    const logger = fakeLogger();
    const service = new ContactAvatarService(cache, source, logger, 1, () => new Date(), 0);

    await service.listAvatars(TENANT, SESSION, ['a@s.whatsapp.net']);
    source.resolveNext('https://cdn/a.jpg');
    await flush();

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('lista vazia não vai ao banco nem à fila', async () => {
    const cache = new FakeCache();
    const findSpy = jest.spyOn(cache, 'findManyByContactJids');
    const source = new ControllableSource();
    const service = new ContactAvatarService(cache, source, fakeLogger(), 1, () => new Date(), 0);

    expect(await service.listAvatars(TENANT, SESSION, [])).toEqual([]);
    expect(findSpy).not.toHaveBeenCalled();
  });
});
