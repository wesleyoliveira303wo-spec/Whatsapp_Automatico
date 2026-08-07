import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validateOrRespond } from '../../../shared/presentation/httpHelpers';
import { MediaDownloader } from '../domain/providers/MediaDownloader';

const downloadBodySchema = z.object({
  tenantId: z.string().trim().min(1),
  sessionName: z.string().trim().min(1),
  contentType: z.enum(['image', 'audio', 'video', 'document', 'sticker']),
  mimeType: z.string().trim().min(1),
  url: z.string().trim().min(1),
  mediaKeyEncrypted: z.string().trim().min(1),
});

/**
 * Rota INTERNA, processo-a-processo (Fase 1, Bloco F1.2) — permite ao worker
 * de IA (`worker.ts`) obter o binário de uma mídia sem instanciar sockets
 * Baileys ele mesmo (ADR #54: só `apps/api` toca Baileys). Protegida por
 * `requireInternalSecret` (segredo compartilhado via `.env`), NUNCA por
 * `authenticate`/`requireApiKey` — não há tenant/pessoa autenticando aqui, e
 * esta rota nunca deve ser exposta a um cliente HTTP externo (Dashboard,
 * integrações de terceiros).
 *
 * Devolve o binário como STREAMING puro (`res.send(Buffer)`), mesmo padrão já
 * usado pela rota pública de mídia de mensagens
 * (`conversationsRouter.ts`/ADR #90) — nunca base64/JSON. `404` (não `200`
 * com corpo vazio) quando `MediaDownloader.download()` devolve `undefined`
 * (mídia indisponível) — o worker trata isso como "sem binário para anexar",
 * mesma degradação graciosa de qualquer outra falha de download.
 *
 * Montada SEM `:tenantId` no path (diferente de toda rota pública deste
 * projeto) — `tenantId` vem do corpo, e este endpoint não impõe RBAC de
 * tenant algum: o WORKER já é, por construção, um processo interno confiável
 * do próprio deploy, não um cliente de terceiros.
 */
export function createInternalMediaRouter(mediaDownloader: MediaDownloader): Router {
  const router = Router();

  router.post(
    '/download',
    asyncHandler(async (req, res) => {
      const body = validateOrRespond(downloadBodySchema, req.body, res);
      if (!body) return;

      const buffer = await mediaDownloader.download(body.tenantId, body.sessionName, {
        contentType: body.contentType,
        mimeType: body.mimeType,
        url: body.url,
        mediaKeyEncrypted: body.mediaKeyEncrypted,
      });

      if (!buffer) {
        res.status(404).json({ error: 'media_unavailable' });
        return;
      }

      res.setHeader('Content-Type', body.mimeType);
      res.status(200).send(buffer);
    }),
  );

  return router;
}
