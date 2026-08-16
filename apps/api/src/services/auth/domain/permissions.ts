import { UserRole } from './entities/User';

/**
 * Catalogo de permissoes (RBAC) — Milestone 5, Bloco M5D (D55). Permissoes
 * granulares no formato `recurso:acao`, definidas EM CODIGO (fixas, versionadas
 * junto com o codigo — nao linhas editaveis no banco). Uniao literal (nao
 * `string` livre): o TypeScript garante que so permissoes reais sao usadas nas
 * rotas.
 */
export type Permission =
  | 'conversation:read'
  | 'conversation:escalate'
  | 'conversation:resume_own'
  | 'conversation:resume_any'
  | 'conversation:reassign'
  | 'message:send'
  | 'session:read'
  | 'session:connect'
  | 'session:disconnect'
  | 'session:remove'
  | 'analytics:read'
  | 'ai_interaction:read'
  | 'ai_profile:read'
  | 'ai_profile:update'
  | 'quick_reply:read'
  | 'quick_reply:manage'
  | 'tag:read'
  | 'tag:manage'
  | 'contact:read'
  | 'contact:manage'
  | 'user:read'
  | 'user:create'
  | 'user:update'
  | 'user:suspend'
  | 'user:manage_admins'
  | 'audit:read'
  | 'tenant:manage'
  | 'ownership:transfer';

// Conjuntos montados por COMPOSICAO (espalhando o cargo inferior) — e so uma
// forma de construir a constante de forma legivel, NAO heranca em runtime. O
// resultado e um mapa explicito cargo->permissoes, facil de auditar ("por que
// esse cargo pode X?" = olhar a lista), sem as armadilhas de heranca encadeada
// de RBAC. O OWNER e tratado a parte (tem tudo, inclusive permissoes futuras).
const READ_ONLY: readonly Permission[] = [
  'conversation:read',
  'session:read',
  'analytics:read',
  'ai_interaction:read',
];

const OPERATOR: readonly Permission[] = [
  ...READ_ONLY,
  'session:connect',
  'session:disconnect',
  'conversation:escalate',
  'conversation:resume_own',
  'message:send',
  // Fase 1, Bloco F1.9 — quem ja manda mensagem ja pode listar/inserir
  // respostas rapidas no composer (so a GESTAO delas exige administrator+).
  'quick_reply:read',
  // Redesign 2026-08-05 (R4) — quem ja manda mensagem ja pode ver/atribuir
  // tags numa conversa (so o CATALOGO — criar/editar/remover tag — exige
  // administrator+, mesmo racional de quick_reply).
  'tag:read',
  // Fase L, Bloco L1b — quem ja atende ja pode consultar a base de leads
  // (nome/telefone/origem) enquanto trabalha. So a IMPORTACAO em lote exige
  // administrator+ (`contact:manage`), mesmo racional de quick_reply/tag:
  // uma importacao errada polui a base do tenant inteiro de uma vez.
  'contact:read',
];

const MANAGER: readonly Permission[] = [
  ...OPERATOR,
  'conversation:resume_any',
  'conversation:reassign',
  'audit:read',
];

const ADMINISTRATOR: readonly Permission[] = [
  ...MANAGER,
  'session:remove',
  'user:read',
  'user:create',
  'user:update',
  'user:suspend',
  // Base de Conhecimento (Nivel 1) — configurar o "Cerebro da IA" e uma acao
  // de administracao da empresa (mesmo nivel de gestao de usuarios), nao de
  // operacao do dia a dia. Owner herda tudo via `hasPermission`.
  'ai_profile:read',
  'ai_profile:update',
  // Fase 1, Bloco F1.9 — CADASTRAR/editar/remover respostas rapidas e
  // administracao da empresa, mesmo nivel de ai_profile:update. LER/inserir
  // no composer ja esta liberado desde OPERATOR (`quick_reply:read` acima).
  'quick_reply:manage',
  // Redesign 2026-08-05 (R4) — CADASTRAR/editar/remover tags do catalogo e
  // administracao da empresa. Ver/atribuir tag numa conversa ja esta
  // liberado desde OPERATOR (`tag:read` acima).
  'tag:manage',
  // Fase L, Bloco L1b — importar uma planilha de leads e administracao da
  // empresa (afeta o tenant inteiro de uma vez), mesmo nivel de
  // ai_profile:update/quick_reply:manage. LER a base ja esta liberado desde
  // OPERATOR (`contact:read` acima).
  'contact:manage',
];

/**
 * Mapa cargo -> permissoes (exceto OWNER, que tem tudo — ver `hasPermission`).
 * `Set` para checagem O(1).
 */
const ROLE_PERMISSIONS: Record<Exclude<UserRole, 'owner'>, ReadonlySet<Permission>> = {
  read_only: new Set(READ_ONLY),
  operator: new Set(OPERATOR),
  manager: new Set(MANAGER),
  administrator: new Set(ADMINISTRATOR),
};

/**
 * Um cargo tem uma permissao? O OWNER tem SEMPRE tudo (inclusive permissoes
 * adicionadas no futuro — por isso e um `return true`, nao um conjunto que
 * poderia ficar desatualizado). Os demais consultam o mapa fixo.
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  if (role === 'owner') {
    return true;
  }
  return ROLE_PERMISSIONS[role].has(permission);
}

/**
 * Regua de senioridade dos cargos — Milestone 5, Bloco M5E. Complementa
 * `hasPermission`: permissao diz "esse cargo pode gerenciar usuarios?";
 * a regua diz "pode gerenciar ESTE usuario?" (so quem esta ABAIXO de mim).
 * Numeros sao so ordem relativa (nao ha aritmetica alem de comparacao).
 */
const ROLE_RANK: Record<UserRole, number> = {
  read_only: 0,
  operator: 1,
  manager: 2,
  administrator: 3,
  owner: 4,
};

/**
 * `a` esta ESTRITAMENTE acima de `b` na hierarquia? Estrito de proposito:
 * cargo igual NAO outorga gestao (um administrator nao gerencia outro
 * administrator — evita que admins se blindem criando/derrubando pares).
 * Consequencia util: NINGUEM outranks um owner, entao owner nunca pode ser
 * suspenso/rebaixado por este caminho — o invariante "sempre ha um owner
 * ativo" cai de graca dessa regra, sem checagem extra.
 */
export function outranks(a: UserRole, b: UserRole): boolean {
  return ROLE_RANK[a] > ROLE_RANK[b];
}
