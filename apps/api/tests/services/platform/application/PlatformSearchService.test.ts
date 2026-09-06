import { PlatformSearchService } from '../../../../src/services/platform/application/PlatformSearchService';
import { FakePlatformSearchRepository, rawHit } from '../testDoubles';

function build() {
  const repo = new FakePlatformSearchRepository();
  const service = new PlatformSearchService(repo);
  return { repo, service };
}

describe('PlatformSearchService (Fase 6 — §7)', () => {
  it('consulta curta (< 2 chars) não toca o repositório', async () => {
    const { repo, service } = build();
    const res = await service.search(' a ');
    expect(res.groups).toEqual([]);
    expect(repo.lastCall).toBeNull();
  });

  it('agrupa por tipo, na ordem tenant → user → contact → session → campaign', async () => {
    const { repo, service } = build();
    repo.seed({
      campaign: [rawHit({ kind: 'campaign', primary: 'Promo', tenantId: 't9', tenantName: 'Nove' })],
      tenant: [rawHit({ kind: 'tenant', primary: 'Cliente Um', tenantId: 't1', tenantName: 'Cliente Um' })],
      contact: [rawHit({ kind: 'contact', primary: '+5521999998888', tenantId: 't1', tenantName: 'Cliente Um' })],
    });

    const res = await service.search('cli');

    expect(res.groups.map((g) => g.kind)).toEqual(['tenant', 'contact', 'campaign']);
    expect(res.groups[0].hits[0]).toMatchObject({
      kind: 'tenant',
      label: 'Cliente Um',
      sublabel: 't1',
      href: '/admin/tenants/t1',
    });
    expect(res.groups[1].hits[0]).toMatchObject({
      kind: 'contact',
      label: '+5521999998888',
      sublabel: 'Contato · no tenant Cliente Um',
      href: '/admin/tenants/t1',
    });
  });

  it('teto de 5 por tipo + flag hasMore quando o repo devolve 6', async () => {
    const { repo, service } = build();
    repo.seed({
      user: Array.from({ length: 6 }, (_, i) =>
        rawHit({ kind: 'user', primary: `u${i}@x.com`, tenantId: 't1' }),
      ),
    });

    const res = await service.search('x.com');

    expect(res.groups[0].hits).toHaveLength(5);
    expect(res.groups[0].hasMore).toBe(true);
    // pediu teto + 1 ao repositório.
    expect(repo.lastCall?.limit).toBe(6);
  });

  it('extrai só os dígitos da consulta (telefone com +, espaço e hífen)', async () => {
    const { repo, service } = build();
    await service.search('+55 21 98960-9605');
    expect(repo.lastCall?.digits).toBe('5521989609605');
    expect(repo.lastCall?.term).toBe('+55 21 98960-9605');
  });

  it('privacidade §7: nenhum campo do resultado carrega conteúdo de conversa', async () => {
    const { repo, service } = build();
    repo.seed({
      contact: [rawHit({ kind: 'contact', primary: '+5521999998888', tenantId: 't1' })],
    });
    const res = await service.search('99999');
    const hit = res.groups[0].hits[0] as Record<string, unknown>;
    expect(Object.keys(hit).sort()).toEqual(
      ['href', 'id', 'kind', 'label', 'sublabel', 'tenantId'].sort(),
    );
  });
});
