import express from 'express';
import request from 'supertest';

import { createContactsRouter } from '../../../../src/services/contacts/presentation/contactsRouter';
import { createContactsErrorHandler } from '../../../../src/services/contacts/presentation/contactsErrorHandler';
import { ContactImportService } from '../../../../src/services/contacts/application/ContactImportService';
import { ContactConsentService } from '../../../../src/services/contacts/application/ContactConsentService';
import { Principal, RequestWithPrincipal } from '../../../../src/shared/presentation/authenticate';
import { UserRole } from '../../../../src/services/auth/domain/entities/User';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakeContactRepository } from '../infrastructure/FakeContactRepository';
import { FakeConsentEventRepository } from '../infrastructure/FakeConsentEventRepository';

/**
 * Testes do contactsRouter (Fase L, Blocos L1b/L2): RBAC por rota
 * (GET->contact:read, POST /import|opt-out|opt-in->contact:manage) + IDOR
 * entre tenants + a rota de importação (corpo CRU, não JSON). Principal
 * injetado por middleware, mesma técnica de `tagRouter.test.ts`.
 *
 * Mount TENANT-WIDE (não por sessão): `/api/tenants/:tenantId/contacts`.
 */
function buildApp(principal?: Principal): {
  app: express.Express;
  contacts: FakeContactRepository;
  events: FakeConsentEventRepository;
} {
  const tenantRepository = new FakeTenantRepository();
  tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
  const contacts = new FakeContactRepository();
  const events = new FakeConsentEventRepository();
  const importService = new ContactImportService(contacts, tenantRepository, new NoopLogger());
  const consentService = new ContactConsentService(
    contacts,
    events,
    tenantRepository,
    new NoopLogger(),
  );

  const app = express();
  app.use(express.json());
  app.use(
    '/api/tenants/:tenantId/contacts',
    (req, _res, next) => {
      if (principal) (req as RequestWithPrincipal).principal = principal;
      next();
    },
    createContactsRouter(contacts, importService, consentService),
  );
  app.use('/api/tenants/:tenantId/contacts', createContactsErrorHandler(new NoopLogger()));
  return { app, contacts, events };
}

function person(role: UserRole): Principal {
  return { kind: 'user', userId: 'user-1', tenantId: 'tenant-1', role };
}
const MACHINE: Principal = { kind: 'machine', tenantId: 'tenant-1' };

function basePath(tenantId: string): string {
  return `/api/tenants/${tenantId}/contacts`;
}

describe('contactsRouter (Fase L, Bloco L1b)', () => {
  describe('GET / (contact:read)', () => {
    it('operator lê: lista vazia quando o tenant não tem nenhum contato (200)', async () => {
      const { app } = buildApp(person('operator'));

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ contacts: [] });
    });

    it('devolve os contatos cadastrados', async () => {
      const { app, contacts } = buildApp(person('operator'));
      contacts.seed({ tenantId: 'tenant-1', phoneE164: '5521988887777', name: 'Maria' });

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.status).toBe(200);
      expect(response.body.contacts).toHaveLength(1);
      expect(response.body.contacts[0]).toMatchObject({ name: 'Maria' });
    });

    it('não mistura contatos de tenants diferentes (IDOR)', async () => {
      const { app, contacts } = buildApp(person('operator'));
      contacts.seed({ tenantId: 'tenant-1', phoneE164: '5521988887777', name: 'Tenant Um' });
      contacts.seed({ tenantId: 'tenant-2', phoneE164: '5521977776666', name: 'Tenant Dois' });

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.body.contacts).toHaveLength(1);
      expect(response.body.contacts[0].name).toBe('Tenant Um');
    });

    it('read_only NÃO pode ler (403 — sem contact:read)', async () => {
      const { app } = buildApp(person('read_only'));

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.status).toBe(403);
    });

    it('plano máquina (chave da empresa) lê normalmente (200)', async () => {
      const { app } = buildApp(MACHINE);

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.status).toBe(200);
    });

    it('respeita o parâmetro search (filtra por nome/telefone)', async () => {
      const { app, contacts } = buildApp(person('operator'));
      contacts.seed({ tenantId: 'tenant-1', phoneE164: '5521988887777', name: 'Maria' });
      contacts.seed({ tenantId: 'tenant-1', phoneE164: '5521977776666', name: 'João' });

      const response = await request(app).get(`${basePath('tenant-1')}?search=maria`);

      expect(response.body.contacts).toHaveLength(1);
      expect(response.body.contacts[0].name).toBe('Maria');
    });
  });

  describe('GET /stats (contact:read)', () => {
    it('devolve as contagens da base do tenant (200)', async () => {
      const { app, contacts } = buildApp(person('operator'));
      const comConversa = contacts.seed({ tenantId: 'tenant-1', phoneE164: '5521988887777' });
      contacts.seed({ tenantId: 'tenant-1', phoneE164: '5521977776666' });
      contacts.seedConversation(comConversa, { id: 'conv-1', sessionName: 'vendas' });

      const response = await request(app).get(`${basePath('tenant-1')}/stats`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        total: 2,
        withConversation: 1,
        withoutConversation: 1,
        optedOut: 0,
        bySource: { whatsapp: 2, import: 0, manual: 0 },
      });
    });

    it('não conta contatos de outro tenant (IDOR)', async () => {
      const { app, contacts } = buildApp(person('operator'));
      contacts.seed({ tenantId: 'tenant-1', phoneE164: '5521988887777' });
      contacts.seed({ tenantId: 'tenant-2', phoneE164: '5521977776666' });

      const response = await request(app).get(`${basePath('tenant-1')}/stats`);

      expect(response.body.total).toBe(1);
    });

    it('read_only NÃO pode ler as contagens (403 — sem contact:read)', async () => {
      const { app } = buildApp(person('read_only'));

      const response = await request(app).get(`${basePath('tenant-1')}/stats`);

      expect(response.status).toBe(403);
    });

    // `/stats` é declarado ANTES de `/:contactId/...` no router — sem isso o
    // Express interpretaria "stats" como um contactId.
    it('a rota /stats não é confundida com um contactId', async () => {
      const { app } = buildApp(person('operator'));

      const response = await request(app).get(`${basePath('tenant-1')}/stats`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total');
    });
  });

  describe('POST /import (contact:manage)', () => {
    it('administrator importa um CSV e recebe o relatório (200)', async () => {
      const { app, contacts } = buildApp(person('administrator'));
      const csv = 'Nome,Telefone\nMaria,5521988887777';

      const response = await request(app)
        .post(`${basePath('tenant-1')}/import`)
        .set('Content-Type', 'text/csv')
        .send(csv);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ totalRows: 1, created: 1 });
      expect(await contacts.findByPhone('tenant-1', '5521988887777')).toMatchObject({
        name: 'Maria',
      });
    });

    it('operator NÃO pode importar (403 — sem contact:manage)', async () => {
      const { app } = buildApp(person('operator'));

      const response = await request(app)
        .post(`${basePath('tenant-1')}/import`)
        .set('Content-Type', 'text/csv')
        .send('Nome,Telefone\nMaria,5521988887777');

      expect(response.status).toBe(403);
    });

    it('rejeita corpo vazio (400)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .post(`${basePath('tenant-1')}/import`)
        .set('Content-Type', 'text/csv')
        .send('');

      expect(response.status).toBe(400);
    });

    it('devolve 404 quando o tenant não existe', async () => {
      const { app } = buildApp({
        kind: 'user',
        userId: 'user-1',
        tenantId: 'tenant-fantasma',
        role: 'administrator',
      });

      const response = await request(app)
        .post(`${basePath('tenant-fantasma')}/import`)
        .set('Content-Type', 'text/csv')
        .send('Nome,Telefone\nMaria,5521988887777');

      expect(response.status).toBe(404);
    });

    it('não vaza dado ao importar num tenant e listar no outro (IDOR)', async () => {
      const { app, contacts } = buildApp(person('administrator'));

      await request(app)
        .post(`${basePath('tenant-1')}/import`)
        .set('Content-Type', 'text/csv')
        .send('Nome,Telefone\nMaria,5521988887777');

      expect(await contacts.findByPhone('tenant-2', '5521988887777')).toBeUndefined();
    });
  });

  describe('POST /:contactId/opt-out (contact:manage)', () => {
    it('administrator marca opt-out e recebe o contato atualizado (200)', async () => {
      const { app, contacts, events } = buildApp(person('administrator'));
      const id = contacts.seed({ tenantId: 'tenant-1', phoneE164: '5521988887777' });

      const response = await request(app).post(`${basePath('tenant-1')}/${id}/opt-out`);

      expect(response.status).toBe(200);
      expect(response.body.contact.optOutAt).toBeTruthy();
      expect(events.getAll()).toEqual([
        expect.objectContaining({ contactId: id, type: 'opt_out', reason: 'manual' }),
      ]);
    });

    it('registra o administrator autenticado como ator do evento', async () => {
      const { app, contacts, events } = buildApp(person('administrator'));
      const id = contacts.seed({ tenantId: 'tenant-1', phoneE164: '5521988887777' });

      await request(app).post(`${basePath('tenant-1')}/${id}/opt-out`);

      expect(events.getAll()[0].actorUserId).toBe('user-1');
    });

    it('operator NÃO pode marcar opt-out (403 — sem contact:manage)', async () => {
      const { app, contacts } = buildApp(person('operator'));
      const id = contacts.seed({ tenantId: 'tenant-1', phoneE164: '5521988887777' });

      const response = await request(app).post(`${basePath('tenant-1')}/${id}/opt-out`);

      expect(response.status).toBe(403);
    });

    it('devolve 404 para um contactId inexistente', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app).post(`${basePath('tenant-1')}/contact-fantasma/opt-out`);

      expect(response.status).toBe(404);
    });

    it('devolve 404 (não vaza dado) para contato de OUTRO tenant', async () => {
      const { app, contacts } = buildApp(person('administrator'));
      const id = contacts.seed({ tenantId: 'tenant-2', phoneE164: '5521988887777' });

      const response = await request(app).post(`${basePath('tenant-1')}/${id}/opt-out`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /:contactId/opt-in (contact:manage)', () => {
    it('administrator reverte o opt-out e recebe o contato atualizado (200)', async () => {
      const { app, contacts, events } = buildApp(person('administrator'));
      const id = contacts.seed({
        tenantId: 'tenant-1',
        phoneE164: '5521988887777',
        optOutAt: new Date(),
      });

      const response = await request(app).post(`${basePath('tenant-1')}/${id}/opt-in`);

      expect(response.status).toBe(200);
      expect(response.body.contact.optOutAt).toBeFalsy();
      expect(events.getAll()).toEqual([expect.objectContaining({ contactId: id, type: 'opt_in' })]);
    });

    it('operator NÃO pode reverter opt-out (403 — sem contact:manage)', async () => {
      const { app, contacts } = buildApp(person('operator'));
      const id = contacts.seed({
        tenantId: 'tenant-1',
        phoneE164: '5521988887777',
        optOutAt: new Date(),
      });

      const response = await request(app).post(`${basePath('tenant-1')}/${id}/opt-in`);

      expect(response.status).toBe(403);
    });

    it('devolve 404 para um contactId inexistente', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app).post(`${basePath('tenant-1')}/contact-fantasma/opt-in`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST / (contact:manage) — criação manual (Reorganização Contatos/Campanhas, 2026-08-17)', () => {
    it('administrator cria um contato novo (201, wasCreated: true)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ phone: '65988887777', name: 'Maria' });

      expect(response.status).toBe(201);
      expect(response.body.wasCreated).toBe(true);
      expect(response.body.contact).toMatchObject({
        phoneE164: '5565988887777',
        name: 'Maria',
        source: 'manual',
      });
    });

    it('telefone já existente: devolve o contato como está (200, wasCreated: false)', async () => {
      const { app, contacts } = buildApp(person('administrator'));
      contacts.seed({ tenantId: 'tenant-1', phoneE164: '5565988887777', name: 'Já Existia' });

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ phone: '65988887777', name: 'Nome Novo Ignorado' });

      expect(response.status).toBe(200);
      expect(response.body.wasCreated).toBe(false);
      expect(response.body.contact.name).toBe('Já Existia');
    });

    it('telefone inválido: 400', async () => {
      const { app } = buildApp(person('administrator'));
      const response = await request(app).post(basePath('tenant-1')).send({ phone: '123' });
      expect(response.status).toBe(400);
    });

    it('operator NÃO pode criar contato manualmente (403)', async () => {
      const { app } = buildApp(person('operator'));
      const response = await request(app).post(basePath('tenant-1')).send({ phone: '65988887777' });
      expect(response.status).toBe(403);
    });
  });

  describe('PATCH /:contactId (contact:manage)', () => {
    it('edita o nome (200)', async () => {
      const { app, contacts } = buildApp(person('administrator'));
      const id = contacts.seed({ tenantId: 'tenant-1', phoneE164: '5565988887777' });

      const response = await request(app)
        .patch(`${basePath('tenant-1')}/${id}`)
        .send({ name: 'Novo Nome' });

      expect(response.status).toBe(200);
      expect(response.body.contact.name).toBe('Novo Nome');
    });

    it('edita o telefone (normalizado)', async () => {
      const { app, contacts } = buildApp(person('administrator'));
      const id = contacts.seed({ tenantId: 'tenant-1', phoneE164: '5565988887777' });

      const response = await request(app)
        .patch(`${basePath('tenant-1')}/${id}`)
        .send({ phone: '(65) 8888-7776' });

      expect(response.status).toBe(200);
      expect(response.body.contact.phoneE164).toBe('5565988887776');
    });

    it('telefone que já pertence a OUTRO contato: 409', async () => {
      const { app, contacts } = buildApp(person('administrator'));
      contacts.seed({ tenantId: 'tenant-1', phoneE164: '5565988887777' });
      const id = contacts.seed({ tenantId: 'tenant-1', phoneE164: '5565988887776' });

      const response = await request(app)
        .patch(`${basePath('tenant-1')}/${id}`)
        .send({ phone: '65988887777' });

      expect(response.status).toBe(409);
    });

    it('IDOR: contactId de outro tenant devolve 404, nunca edita', async () => {
      const { app, contacts } = buildApp(person('administrator'));
      const id = contacts.seed({ tenantId: 'outro-tenant', phoneE164: '5565988887777' });

      const response = await request(app)
        .patch(`${basePath('tenant-1')}/${id}`)
        .send({ name: 'Invasor' });

      expect(response.status).toBe(404);
    });

    it('operator NÃO pode editar (403)', async () => {
      const { app, contacts } = buildApp(person('operator'));
      const id = contacts.seed({ tenantId: 'tenant-1', phoneE164: '5565988887777' });

      const response = await request(app)
        .patch(`${basePath('tenant-1')}/${id}`)
        .send({ name: 'Novo Nome' });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /:contactId (contact:manage)', () => {
    it('administrator remove o contato (204)', async () => {
      const { app, contacts } = buildApp(person('administrator'));
      const id = contacts.seed({ tenantId: 'tenant-1', phoneE164: '5565988887777' });

      const response = await request(app).delete(`${basePath('tenant-1')}/${id}`);

      expect(response.status).toBe(204);
      expect(await contacts.findById('tenant-1', id)).toBeUndefined();
    });

    it('IDOR: contactId de outro tenant devolve 404, nunca remove', async () => {
      const { app, contacts } = buildApp(person('administrator'));
      const id = contacts.seed({ tenantId: 'outro-tenant', phoneE164: '5565988887777' });

      const response = await request(app).delete(`${basePath('tenant-1')}/${id}`);

      expect(response.status).toBe(404);
      expect(await contacts.findById('outro-tenant', id)).toBeDefined();
    });

    it('operator NÃO pode remover (403)', async () => {
      const { app, contacts } = buildApp(person('operator'));
      const id = contacts.seed({ tenantId: 'tenant-1', phoneE164: '5565988887777' });

      const response = await request(app).delete(`${basePath('tenant-1')}/${id}`);

      expect(response.status).toBe(403);
    });
  });
});
