import { hasPermission, outranks } from '../../../../src/services/auth/domain/permissions';

describe('permissions / hasPermission (Milestone 5, Bloco M5D)', () => {
  it('OWNER tem qualquer permissao (inclusive as mais restritas)', () => {
    expect(hasPermission('owner', 'user:manage_admins')).toBe(true);
    expect(hasPermission('owner', 'session:remove')).toBe(true);
    expect(hasPermission('owner', 'conversation:read')).toBe(true);
  });

  it('READ_ONLY so le (nao pode escalar/enviar/criar usuario)', () => {
    expect(hasPermission('read_only', 'conversation:read')).toBe(true);
    expect(hasPermission('read_only', 'analytics:read')).toBe(true);
    expect(hasPermission('read_only', 'conversation:escalate')).toBe(false);
    expect(hasPermission('read_only', 'message:send')).toBe(false);
    expect(hasPermission('read_only', 'user:create')).toBe(false);
  });

  it('OPERATOR escala e retoma as PROPRIAS, mas nao as dos outros nem reatribui', () => {
    expect(hasPermission('operator', 'conversation:escalate')).toBe(true);
    expect(hasPermission('operator', 'conversation:resume_own')).toBe(true);
    expect(hasPermission('operator', 'message:send')).toBe(true);
    expect(hasPermission('operator', 'conversation:resume_any')).toBe(false);
    expect(hasPermission('operator', 'conversation:reassign')).toBe(false);
    expect(hasPermission('operator', 'user:create')).toBe(false);
    expect(hasPermission('operator', 'session:remove')).toBe(false);
  });

  it('MANAGER retoma/reatribui qualquer conversa e le auditoria, mas nao gerencia usuarios', () => {
    expect(hasPermission('manager', 'conversation:resume_any')).toBe(true);
    expect(hasPermission('manager', 'conversation:reassign')).toBe(true);
    expect(hasPermission('manager', 'audit:read')).toBe(true);
    expect(hasPermission('manager', 'user:create')).toBe(false);
    expect(hasPermission('manager', 'session:remove')).toBe(false);
  });

  it('ADMINISTRATOR gerencia usuarios e remove sessao (mas nao gerencia admins)', () => {
    expect(hasPermission('administrator', 'user:create')).toBe(true);
    expect(hasPermission('administrator', 'user:suspend')).toBe(true);
    expect(hasPermission('administrator', 'session:remove')).toBe(true);
    expect(hasPermission('administrator', 'conversation:resume_any')).toBe(true);
    expect(hasPermission('administrator', 'user:manage_admins')).toBe(false);
    expect(hasPermission('administrator', 'tenant:manage')).toBe(false);
  });

  it('Base de Conhecimento (ai_profile): so administrator/owner configuram; demais nao', () => {
    expect(hasPermission('owner', 'ai_profile:read')).toBe(true);
    expect(hasPermission('owner', 'ai_profile:update')).toBe(true);
    expect(hasPermission('administrator', 'ai_profile:read')).toBe(true);
    expect(hasPermission('administrator', 'ai_profile:update')).toBe(true);
    expect(hasPermission('manager', 'ai_profile:update')).toBe(false);
    expect(hasPermission('operator', 'ai_profile:read')).toBe(false);
    expect(hasPermission('read_only', 'ai_profile:read')).toBe(false);
  });
});

describe('permissions / outranks (Milestone 5, Bloco M5E)', () => {
  it('hierarquia estrita: owner > administrator > manager > operator > read_only', () => {
    expect(outranks('owner', 'administrator')).toBe(true);
    expect(outranks('administrator', 'manager')).toBe(true);
    expect(outranks('manager', 'operator')).toBe(true);
    expect(outranks('operator', 'read_only')).toBe(true);
  });

  it('cargo IGUAL nao outorga gestao (estrito) — admins nao se blindam criando pares', () => {
    expect(outranks('administrator', 'administrator')).toBe(false);
    expect(outranks('owner', 'owner')).toBe(false);
  });

  it('ninguem outranks o owner (invariante: owner nunca e suspenso/rebaixado)', () => {
    expect(outranks('administrator', 'owner')).toBe(false);
    expect(outranks('manager', 'owner')).toBe(false);
  });
});
