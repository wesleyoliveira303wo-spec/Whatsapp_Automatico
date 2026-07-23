import { Router } from 'express';
import { z } from 'zod';
import { AiBusinessProfileService, MAX_PROFILE_CONTENT_LENGTH } from '../application/AiBusinessProfileService';
import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { requirePermission } from '../../../shared/presentation/requirePermission';

const tenantIdParamSchema = z.object({ tenantId: z.string().trim().min(1, 'tenantId não pode ser vazio') });

/**
 * Corpo do `PUT`. `content` string (pode ser vazia — salvar vazio "apaga o
 * cérebro", voltando a IA ao comportamento genérico). Teto de tamanho vindo do
 * Application (`MAX_PROFILE_CONTENT_LENGTH`) — o texto vira tokens a cada
 * resposta, então um limite explícito protege o custo. NÃO usamos `.trim()` no
 * schema: preservamos o texto exato que o dono digitou (quebras de linha,
 * formatação) — o `PromptBuilder` já faz `trim()` só para decidir se anexa.
 */
const saveProfileBodySchema = z.object({
  content: z
    .string()
    .max(MAX_PROFILE_CONTENT_LENGTH, `O texto não pode passar de ${MAX_PROFILE_CONTENT_LENGTH} caracteres.`),
});

/**
 * Router REST (Presentation) da Base de Conhecimento (Nível 1) — o "Cérebro da
 * IA". Vive em `services/ai/presentation/`, ao lado de `aiInteractionsRouter`
 * (mesmo bounded context). Montado sob `/api/tenants/:tenantId/ai-profile` (ver
 * `index.ts`) com `{ mergeParams: true }` pelo mesmo motivo dos demais routers.
 *
 * `GET /` devolve `{ profile: { content, updatedAt } | null }` — `null` quando
 * o tenant nunca configurou (a UI mostra o textarea vazio). `PUT /` faz upsert
 * e devolve o perfil persistido.
 *
 * RBAC POR ROTA (mesmo padrão de `conversationsRouter`, não de
 * `aiInteractionsRouter`): o `requirePermission` é aplicado por VERBO aqui
 * dentro — GET exige `ai_profile:read`, PUT exige `ai_profile:update` — em vez
 * de um único `requirePermission` no mount (`index.ts`). É mais preciso: ler e
 * editar o "cérebro" são permissões distintas, ainda que hoje só
 * administrator/owner tenham ambas. No mount, só o `authenticate` roda. O plano
 * máquina (chave da empresa) passa por ambos (acesso total, ver
 * `requirePermission`).
 */
export function createAiProfileRouter(aiBusinessProfileService: AiBusinessProfileService): Router {
  const router = Router({ mergeParams: true });

  router.get(
    '/',
    requirePermission('ai_profile:read'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;

      const profile = await aiBusinessProfileService.getProfile(params.tenantId);
      res.status(200).json({ profile });
    }),
  );

  router.put(
    '/',
    requirePermission('ai_profile:update'),
    asyncHandler(async (req, res) => {
      const params = validateOrRespond(tenantIdParamSchema, req.params, res);
      if (!params) return;
      const body = validateOrRespond(saveProfileBodySchema, req.body, res);
      if (!body) return;

      const profile = await aiBusinessProfileService.saveProfile(params.tenantId, body.content);
      res.status(200).json({ profile });
    }),
  );

  return router;
}
