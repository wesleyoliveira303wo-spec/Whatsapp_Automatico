import path from 'path';
import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import type Redis from 'ioredis';
import type { Worker } from 'bullmq';

// Caminho absoluto para o `.env` da RAIZ do monorepo, calculado a partir
// de `__dirname` (não de `process.cwd()`): `npm run dev -w apps/api` executa
// este arquivo com cwd = `apps/api/`, não a raiz — `dotenv.config()` sem
// `path` procuraria (e não acharia) um `.env` dentro de `apps/api/`. Mesma
// profundidade relativa tanto em dev (`tsx`, __dirname = apps/api/src)
// quanto compilado (`dist/index.js`, __dirname = apps/api/dist).
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const app = express();
app.use(express.json());

// Simple health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'OK' });
});

/**
 * Recursos que precisam de encerramento gracioso (Milestone 3, Bloco 5 — D7
 * do levantamento arquitetural: até este bloco, `index.ts` não tinha NENHUM
 * handler de `SIGTERM`/`SIGINT`, lacuna que passou a importar de verdade a
 * partir do momento em que este processo passa a manter um `bullmq.Worker`
 * consumindo `whatsapp-outbound` e conexões `ioredis` abertas). Populado
 * por `mountWhatsAppSessionsRoutes()`; consumido só pelo handler de sinal
 * registrado mais abaixo (nunca antes de `require.main === module`).
 * `outboundWorker`/`aiReplyProducerConnection` ficam ausentes no modo
 * degradado (D8: sem `REDIS_URL`), quando só `prisma` precisa ser fechado.
 */
interface ShutdownHandles {
  prisma: { $disconnect: () => Promise<void> };
  outboundWorker?: Worker;
  aiReplyProducerConnection?: Redis;
}

let shutdownHandles: ShutdownHandles | undefined;

/**
 * Serviço de sessões guardado para a restauração automática no boot (ver
 * `restoreConnectedSessions()`). Mesmo padrão de `shutdownHandles` acima:
 * populado por `mountWhatsAppSessionsRoutes()`, consumido só depois de
 * `require.main === module`.
 *
 * Fica `undefined` no modo degradado (sem `REDIS_URL`) DE PROPÓSITO: sem o
 * pipeline de conversas montado, uma sessão reconectada receberia mensagens
 * e as descartaria silenciosamente. Reconectar ali seria pior que não
 * reconectar — o operador veria "Conectado" e acharia que está atendendo.
 */
interface SessionRestoreHandles {
  prisma: {
    whatsAppSession: {
      findMany: (args: {
        where: { status: 'CONNECTED' };
        select: { tenantId: true; sessionName: true };
      }) => Promise<{ tenantId: string; sessionName: string }[]>;
    };
  };
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
  };
  sessionService: { initSession: (tenantId: string, sessionName: string) => Promise<unknown> };
}

let sessionRestoreHandles: SessionRestoreHandles | undefined;

/**
 * Reconecta, na subida do processo, as sessões que estavam CONECTADAS quando
 * a API foi encerrada.
 *
 * Por que isto é necessário: as credenciais do Baileys são persistidas em
 * `tenant_credentials` (cifradas), então reconectar NÃO exige QR Code novo —
 * mas nada no processo disparava essa reconexão. Até aqui, um restart da API
 * deixava o WhatsApp fora do ar até alguém abrir a tela da sessão no
 * Dashboard (que chama `getSessionStatus` → `registry.getOrCreate`). Numa
 * operação desatendida (a máquina liga, o Docker sobe, ninguém abre o
 * navegador) as mensagens que chegassem nesse intervalo seriam perdidas.
 *
 * Reutiliza `initSession()` — o MESMO caminho do botão "Conectar" do
 * Dashboard, já testado — em vez de introduzir uma rota de conexão nova.
 *
 * Só restaura sessões com status CONNECTED: uma sessão que o operador
 * desconectou de propósito deve continuar desconectada depois do reboot.
 *
 * Nunca lança: qualquer falha vira `warn` e as demais sessões seguem sendo
 * tentadas. Uma sessão que não reconecta não pode impedir a API de servir.
 */
async function restoreConnectedSessions(): Promise<void> {
  const handles = sessionRestoreHandles;
  if (!handles) {
    return;
  }
  const { prisma, logger, sessionService } = handles;

  if (process.env.WHATSAPP_AUTO_RESTORE === 'false') {
    logger.info('Restauração automática de sessões desabilitada por WHATSAPP_AUTO_RESTORE=false');
    return;
  }

  let sessions: { tenantId: string; sessionName: string }[];
  try {
    sessions = await prisma.whatsAppSession.findMany({
      where: { status: 'CONNECTED' },
      select: { tenantId: true, sessionName: true },
    });
  } catch (error) {
    logger.warn('Não foi possível listar sessões para restaurar', { error });
    return;
  }

  if (sessions.length === 0) {
    return;
  }

  logger.info('Restaurando sessões de WhatsApp conectadas', { total: sessions.length });
  // Sequencial de propósito: cada `init()` abre um socket e faz handshake com
  // o WhatsApp; disparar todos de uma vez em paralelo só aumentaria a chance
  // de throttling do lado deles, sem ganho real (são poucas sessões).
  for (const { tenantId, sessionName } of sessions) {
    try {
      await sessionService.initSession(tenantId, sessionName);
      logger.info('Sessão restaurada', { tenantId, sessionName });
    } catch (error) {
      logger.warn('Falha ao restaurar sessão', { tenantId, sessionName, error });
    }
  }
}

/**
 * Monta as rotas do módulo WhatsApp (Item 5, Bloco 8) e, a partir da
 * Milestone 3 Bloco 5, também o pipeline de conversas/IA — SOMENTE se as
 * variáveis de ambiente necessárias estiverem presentes.
 *
 * IMPORTANTE (regressão corrigida durante o Bloco 8): os módulos importados
 * abaixo (`compositionRoot` -> `BaileysProviderFactory` -> `BaileysProvider`)
 * carregam o pacote real `@whiskeysockets/baileys`, publicado em ESM puro.
 * Um `import` ESTÁTICO no topo deste arquivo carregaria/faria parse desse
 * pacote SEMPRE que `index.ts` fosse importado — inclusive por
 * `health.test.ts`, que não configura essas variáveis — e o Jest (CommonJS)
 * não consegue fazer parse de ESM de `node_modules`, quebrando a suíte
 * inteira. Por isso o `import()` aqui é DINÂMICO e só acontece DEPOIS do
 * guard de env vars abaixo: quando as variáveis estão ausentes, a função
 * retorna antes de qualquer `import()`, e o pacote Baileys nunca é sequer
 * carregado. `/health` funciona sempre, independente de configuração. Os
 * módulos novos do Bloco 5 (`ai`/`conversations`, que não tocam Baileys)
 * seguem o MESMO padrão de import dinâmico, por consistência — não porque
 * precisem, mas para manter um único estilo de carregamento neste arquivo.
 *
 * D8 (levantamento arquitetural do Bloco 5) — `REDIS_URL` ausente NÃO
 * derruba o processo (mesmo padrão de degradação graciosa já usado para as
 * outras 3 variáveis): as rotas de sessão do WhatsApp continuam ativas, mas
 * `MessageIngestionService`/`conversationsRouter`/`aiInteractionsRouter`/o
 * consumidor outbound não são montados — mensagens recebidas via WhatsApp
 * são apenas ignoradas (ver docstring de `MessageReceivedHandler`), nunca
 * perdidas de um jeito que quebre algo.
 */
async function mountWhatsAppSessionsRoutes(): Promise<void> {
  const { DATABASE_URL, WHATSAPP_CREDENTIALS_MASTER_KEY, API_KEY_PEPPER, REDIS_URL } = process.env;
  if (!DATABASE_URL || !WHATSAPP_CREDENTIALS_MASTER_KEY || !API_KEY_PEPPER) {
    console.warn(
      'Rotas de sessão do WhatsApp não montadas: defina DATABASE_URL, WHATSAPP_CREDENTIALS_MASTER_KEY e ' +
        'API_KEY_PEPPER (ver .env.example).',
    );
    return;
  }

  try {
    const [
      { PrismaClient },
      whatsappCompositionModule,
      { createWhatsAppSessionsRouter },
      { createWhatsAppErrorHandler },
      { ConsoleLogger },
      { createAnalyticsComposition },
      { createQuickRepliesComposition },
      { createTagsComposition },
      { createContactsComposition },
      { createAuthComposition },
      { createAuthenticate },
      { requirePermission },
      { HmacSha256ApiKeyHasher },
      { PrismaTenantRepository },
    ] = await Promise.all([
      import('@prisma/client'),
      import('./services/whatsapp/compositionRoot'),
      import('./services/whatsapp/presentation/whatsAppSessionsRouter'),
      import('./services/whatsapp/presentation/whatsAppErrorHandler'),
      import('./shared/infrastructure/logging/ConsoleLogger'),
      import('./services/analytics/compositionRoot'),
      // Fase 1, Bloco F1.9 — respostas rapidas, CRUD autocontido sem Redis
      // (mesmo racional de analytics): carregado aqui, no bloco de imports
      // compartilhado pelos dois ramos (degradado e completo).
      import('./services/quickReplies/compositionRoot'),
      // Redesign 2026-08-05 (R4) — tags, mesmo racional (CRUD sem Redis).
      import('./services/tags/compositionRoot'),
      // Fase L, Bloco L1b — contatos, mesmo racional (CRUD sem Redis).
      import('./services/contacts/compositionRoot'),
      import('./services/auth/compositionRoot'),
      import('./shared/presentation/authenticate'),
      import('./shared/presentation/requirePermission'),
      import('./shared/security/infrastructure/HmacSha256ApiKeyHasher'),
      import('./shared/tenant/infrastructure/PrismaTenantRepository'),
    ]);
    const { createWhatsAppSessionsComposition, createOutboundCommandConsumerWorker } =
      whatsappCompositionModule;

    const logger = new ConsoleLogger({ module: 'api' });
    const prisma = new PrismaClient();

    // Milestone 5, Bloco M5C — rotas de autenticacao (login/refresh/logout/me).
    // Montadas ANTES da ramificacao do Redis porque auth NAO depende de Redis
    // (so HTTP + Postgres) — disponivel tanto no modo degradado quanto no
    // completo. NAO fica atras de `requireApiKey`: login/refresh sao
    // pre-autenticacao (o plano humano substitui a API key para chamadas de
    // pessoa; a API key continua so no plano maquina — ADR #45/#54 intactas).
    // Degrada como o resto: sem ACCESS_TOKEN_SECRET, so avisa e nao monta.
    const { ACCESS_TOKEN_SECRET } = process.env;
    let accessTokenService:
      import('./services/auth/domain/AccessTokenService').AccessTokenService | null = null;
    // Guardada fora do `if` porque as rotas de USUARIOS (M5E) sao montadas mais
    // abaixo, DEPOIS de o `authenticate` existir (elas exigem cracha de pessoa).
    let authComposition: import('./services/auth/compositionRoot').AuthComposition | null = null;
    if (ACCESS_TOKEN_SECRET) {
      authComposition = createAuthComposition(
        prisma,
        {
          accessTokenSecret: ACCESS_TOKEN_SECRET,
          accessTokenTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900),
          refreshTokenTtlMs: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7) * 24 * 60 * 60 * 1000,
        },
        logger,
      );
      accessTokenService = authComposition.accessTokenService;
      app.use('/api/tenants/:tenantId/auth', authComposition.authRouter);
      app.use('/api/tenants/:tenantId/auth', authComposition.authErrorHandler);
    } else {
      console.warn(
        'ACCESS_TOKEN_SECRET ausente: rotas de auth (login/refresh/logout/me) nao montadas (ver .env.example).',
      );
    }

    // Milestone 5, Bloco M5D — `authenticate` (porteiro dois-planos): aceita
    // crachá de pessoa (access token) OU chave da empresa (API key). Usado
    // pelas rotas que ganham RBAC (conversas neste bloco; sessoes no M5D-3).
    // `accessTokenService` pode ser nulo (sem ACCESS_TOKEN_SECRET) — nesse
    // caso so o plano maquina (chave) funciona, preservando o comportamento
    // atual do Dashboard/testes. `API_KEY_PEPPER` ja e garantido pelo guard
    // no topo desta funcao.
    const authenticate = createAuthenticate(
      accessTokenService,
      new HmacSha256ApiKeyHasher(API_KEY_PEPPER),
      new PrismaTenantRepository(prisma),
      logger,
    );

    // Milestone 5, Bloco M5E — rotas de GESTAO DE USUARIOS (o "RH"). Atras do
    // `authenticate`, mas o proprio router rejeita o plano maquina
    // (`human_required`): gestao de gente exige um ator identificavel. Error
    // handler path-scoped (D17). So existe se auth esta configurada (o RH nao
    // faz sentido sem login de pessoa).
    if (authComposition) {
      app.use('/api/tenants/:tenantId/users', authenticate, authComposition.usersRouter);
      app.use('/api/tenants/:tenantId/users', authComposition.usersErrorHandler);

      // Fase 1, Bloco F1.5 — painel de auditoria (leitura). Mesmo `authenticate`
      // dois-planos das demais rotas (API key OU login de pessoa); sem
      // `requireHumanActor` (diferente de `usersRouter`) — é só leitura, não
      // precisa de um ator identificável para consultar. Sem error handler
      // dedicado (rota só de leitura, sem erro de Domain esperado).
      app.use('/api/tenants/:tenantId/audit-logs', authenticate, authComposition.auditLogRouter);
    }

    // D17 (levantamento arquitetural do Bloco 5) — cada error handler é
    // montado ESCOPADO ao path do próprio router (`app.use(path, handler)`),
    // nunca globalmente sem path (como era até o Bloco 4). Um error handler
    // Express montado sem path participa da cadeia de QUALQUER rota da
    // aplicação, na ordem de montagem — e `whatsAppErrorHandler` nunca
    // chamou `next(error)` para um erro desconhecido (só no caso
    // `headersSent`), então, montado globalmente, ele engoliria erros de
    // `conversations`/`ai-interactions` antes de alcançar o handler correto
    // de cada um. Path-scoping resolve isso por construção: o Express só
    // invoca um error handler escopado por path para erros ocorridos DENTRO
    // daquele path.

    if (!REDIS_URL) {
      console.warn(
        'REDIS_URL ausente: pipeline de IA/conversas desabilitado (rotas de whatsapp-sessions continuam ativas, ' +
          'mas sem MessageIngestionService wired — mensagens recebidas serão ignoradas). Ver .env.example.',
      );

      const { sessionService } = createWhatsAppSessionsComposition(
        prisma,
        WHATSAPP_CREDENTIALS_MASTER_KEY,
        API_KEY_PEPPER,
        logger,
      );

      app.use(
        '/api/tenants/:tenantId/whatsapp-sessions',
        authenticate,
        createWhatsAppSessionsRouter(sessionService),
      );
      app.use('/api/tenants/:tenantId/whatsapp-sessions', createWhatsAppErrorHandler(logger));

      // Milestone 4, Bloco M4C — Analytics e read-only sobre Postgres (D51),
      // nao depende de Redis, entao e montado tambem no modo degradado (sem
      // REDIS_URL). Reutiliza o `requireApiKey` ja construido acima; error
      // handler escopado ao path (D17).
      // M6H-4 (2026-07-26): rota migrada de flat para ANINHADA por sessao
      // (mesmo padrao de ai-profile/whatsapp-sessions).
      const degradedAnalytics = createAnalyticsComposition(prisma, logger);
      // M5 (achado do teste ponta a ponta): `authenticate` no lugar de
      // `requireApiKey` — o crachá de pessoa também precisa ler analytics
      // (todo cargo tem `analytics:read`). API key continua aceita (plano
      // máquina do authenticate).
      app.use(
        '/api/tenants/:tenantId/sessions/:sessionName/analytics',
        authenticate,
        requirePermission('analytics:read'),
        degradedAnalytics.analyticsRouter,
      );
      app.use(
        '/api/tenants/:tenantId/sessions/:sessionName/analytics',
        degradedAnalytics.analyticsErrorHandler,
      );

      // Fase 1, Bloco F1.9 — respostas rapidas: CRUD autocontido sobre
      // Postgres, sem fila, entao tambem montado no modo degradado (mesmo
      // racional de Analytics acima). So `authenticate` no mount; RBAC POR
      // ROTA dentro do router (GET->quick_reply:read, demais->quick_reply:manage).
      const degradedQuickReplies = createQuickRepliesComposition(prisma, logger);
      app.use(
        '/api/tenants/:tenantId/sessions/:sessionName/quick-replies',
        authenticate,
        degradedQuickReplies.quickReplyRouter,
      );
      app.use(
        '/api/tenants/:tenantId/sessions/:sessionName/quick-replies',
        degradedQuickReplies.quickReplyErrorHandler,
      );

      // Redesign 2026-08-05 (R4) — tags: CRUD autocontido sobre Postgres,
      // sem fila, mesmo racional de Respostas Rápidas acima. Dois routers
      // (catálogo por sessão + atribuição por conversa), mesmo service.
      const degradedTags = createTagsComposition(prisma, logger);
      app.use(
        '/api/tenants/:tenantId/sessions/:sessionName/tags',
        authenticate,
        degradedTags.tagRouter,
      );
      app.use('/api/tenants/:tenantId/sessions/:sessionName/tags', degradedTags.tagErrorHandler);
      app.use(
        '/api/tenants/:tenantId/conversations/:conversationId/tags',
        authenticate,
        degradedTags.conversationTagRouter,
      );
      app.use(
        '/api/tenants/:tenantId/conversations/:conversationId/tags',
        degradedTags.tagErrorHandler,
      );

      // Fase L, Bloco L1b — contatos: CRUD autocontido sobre Postgres, sem
      // fila, mesmo racional de Tags/Respostas Rápidas acima. TENANT-WIDE
      // (não por sessão) — ver docstring de `WhatsAppContact`.
      const degradedContacts = createContactsComposition(prisma, logger);
      app.use('/api/tenants/:tenantId/contacts', authenticate, degradedContacts.contactsRouter);
      app.use('/api/tenants/:tenantId/contacts', degradedContacts.contactsErrorHandler);

      shutdownHandles = { prisma };
      return;
    }

    // --- Pipeline completo (D15: ordem de composição) ---
    // `ai` -> `conversations` (consome a conexão Redis produtora de
    // `ai-reply`) -> `whatsapp` (consome o `messageIngestionService` de
    // `conversations`, D5) -> consumidor outbound (consome o `registry` de
    // `whatsapp`, D7) -> montagem dos três routers.
    const [
      { default: IORedis },
      { createAiComposition },
      { createConversationsComposition },
      { createConversationsRouter },
      { createConversationsErrorHandler },
      { createAiInteractionsRouter },
      { createAiInteractionsErrorHandler },
      { createAiProfileRouter },
      { createAiProfileErrorHandler },
      { AiProviderFactoryImpl },
      { ConversationSummaryService },
      { createConversationSummaryRouter },
      { createConversationSummaryErrorHandler },
    ] = await Promise.all([
      import('ioredis'),
      import('./services/ai/compositionRoot'),
      import('./services/conversations/compositionRoot'),
      import('./services/conversations/presentation/conversationsRouter'),
      import('./services/conversations/presentation/conversationsErrorHandler'),
      import('./services/ai/presentation/aiInteractionsRouter'),
      import('./services/ai/presentation/aiInteractionsErrorHandler'),
      import('./services/ai/presentation/aiProfileRouter'),
      import('./services/ai/presentation/aiProfileErrorHandler'),
      import('./services/ai/infrastructure/AiProviderFactoryImpl'),
      import('./services/ai/application/ConversationSummaryService'),
      import('./services/ai/presentation/conversationSummaryRouter'),
      import('./services/ai/presentation/conversationSummaryErrorHandler'),
    ]);

    // D19 (levantamento arquitetural do Bloco 5) — duas conexões `ioredis`
    // DISTINTAS dentro deste processo: uma para a `Queue` produtora de
    // `ai-reply` (usada dentro de `createConversationsComposition`), outra
    // para o `Worker` consumidor de `whatsapp-outbound`. Nunca uma única
    // conexão compartilhada entre os dois papéis — risco real já registrado
    // em ADR #56 (Bloco 4): o `Worker` exige `maxRetriesPerRequest: null`,
    // e uma conexão reaproveitada para os dois fins pode aplicar essa opção
    // ao papel errado. Mesmo padrão exato de `worker.ts`.
    const aiReplyProducerConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    const outboundConsumerConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

    const { aiInteractionRepository, aiInteractionsService, aiBusinessProfileService } =
      createAiComposition(prisma, logger);
    const {
      conversationRepository,
      messageRepository,
      messageIngestionService,
      conversationsService,
      aiReplyQueue,
    } = createConversationsComposition(prisma, aiReplyProducerConnection, logger);

    const { sessionService, registry, mediaDownloader, mediaSender } =
      createWhatsAppSessionsComposition(
        prisma,
        WHATSAPP_CREDENTIALS_MASTER_KEY,
        API_KEY_PEPPER,
        logger,
        messageIngestionService,
      );
    // Fase 1, Bloco F1.1 (ADR #90) — injeção tardia: `mediaDownloader` só
    // existe depois de `registry` (ver comentário do parâmetro em
    // `ConversationsService` para o porquê completo da ordem de composição).
    conversationsService.setMediaDownloader(mediaDownloader);
    // Fase 1, Bloco F1.3 — mesmo motivo/mesmo lugar de `setMediaDownloader`.
    conversationsService.setMediaSender(mediaSender);
    // Guarda o serviço para a restauração automática de sessões no boot (ver
    // `restoreConnectedSessions()`). Só neste ramo — no degradado, sem
    // pipeline de conversas, reconectar seria enganoso.
    sessionRestoreHandles = { prisma, logger, sessionService };

    const outboundWorker = createOutboundCommandConsumerWorker(
      registry,
      conversationRepository,
      messageRepository,
      aiInteractionRepository,
      logger,
      outboundConsumerConnection,
    );

    // Fase 1, Bloco F1.2 — rota INTERNA (processo-a-processo) de download de
    // mídia: permite ao worker de IA obter o binário sem instanciar sockets
    // Baileys ele mesmo (ADR #54). Protegida por segredo compartilhado
    // (nunca por `authenticate`/API key — não há tenant/pessoa aqui).
    // Degrada como o resto do arquivo: sem `INTERNAL_API_SECRET`, só avisa e
    // não monta — o worker cai no fallback de "sem MediaDownloader" (F1.2
    // vira só o reconhecimento textual do F1.1, nunca quebra).
    const { INTERNAL_API_SECRET } = process.env;
    if (INTERNAL_API_SECRET) {
      const { requireInternalSecret } = await import('./shared/presentation/requireInternalSecret');
      const { createInternalMediaRouter } =
        await import('./services/whatsapp/presentation/internalMediaRouter');
      app.use(
        '/internal/media',
        requireInternalSecret(INTERNAL_API_SECRET),
        createInternalMediaRouter(mediaDownloader),
      );
    } else {
      console.warn(
        'INTERNAL_API_SECRET ausente: rota interna de mídia não montada (worker de IA não terá interpretação de mídia — ver .env.example).',
      );
    }

    // Milestone 5, Bloco M5D-3 — sessoes usam o porteiro dois-planos
    // (`authenticate`): cracha de pessoa (RBAC no router) OU chave da empresa
    // (plano maquina = acesso total). Dashboard atual (chave) segue igual.
    app.use(
      '/api/tenants/:tenantId/whatsapp-sessions',
      authenticate,
      createWhatsAppSessionsRouter(sessionService),
    );
    app.use('/api/tenants/:tenantId/whatsapp-sessions', createWhatsAppErrorHandler(logger));

    // Milestone 5, Bloco M5D — conversas passam a usar o porteiro dois-planos
    // (`authenticate`) em vez de so `requireApiKey`: crachá de pessoa (com
    // RBAC no router) OU chave da empresa (plano maquina = acesso total). O
    // Dashboard atual, que usa a chave, continua funcionando igual.
    app.use(
      '/api/tenants/:tenantId/conversations',
      authenticate,
      createConversationsRouter(conversationsService),
    );
    app.use('/api/tenants/:tenantId/conversations', createConversationsErrorHandler(logger));

    // M5 (achado do teste ponta a ponta): crachá de pessoa também lê IA
    // (`ai_interaction:read` existe em todos os cargos); API key preservada.
    app.use(
      '/api/tenants/:tenantId/ai-interactions',
      authenticate,
      requirePermission('ai_interaction:read'),
      createAiInteractionsRouter(aiInteractionsService),
    );
    app.use('/api/tenants/:tenantId/ai-interactions', createAiInteractionsErrorHandler(logger));

    // Base de Conhecimento (Nível 1) — o "Cérebro da IA". Migrada de rota
    // flat por tenant para ANINHADA por sessão (M6H-3, 2026-07-25) — mesmo
    // padrão de `whatsapp-sessions/:sessionName/...`. Só `authenticate` no
    // mount; o RBAC é POR ROTA dentro do router (GET->ai_profile:read,
    // PUT->ai_profile:update), mesmo padrão de conversas. Error handler
    // escopado ao path (D17).
    app.use(
      '/api/tenants/:tenantId/sessions/:sessionName/ai-profile',
      authenticate,
      createAiProfileRouter(aiBusinessProfileService),
    );
    app.use(
      '/api/tenants/:tenantId/sessions/:sessionName/ai-profile',
      createAiProfileErrorHandler(logger),
    );

    // Milestone 4, Bloco M4C — Analytics (read-only, D51). Mesmo `requireApiKey`
    // do pipeline completo; error handler escopado ao path (D17). Migrada de
    // rota flat para ANINHADA por sessão — M6H-4, 2026-07-26.
    const analytics = createAnalyticsComposition(prisma, logger);
    app.use(
      '/api/tenants/:tenantId/sessions/:sessionName/analytics',
      authenticate,
      requirePermission('analytics:read'),
      analytics.analyticsRouter,
    );
    app.use(
      '/api/tenants/:tenantId/sessions/:sessionName/analytics',
      analytics.analyticsErrorHandler,
    );

    // Fase 1, Bloco F1.9 — respostas rapidas (templates) para o atendente
    // humano. So `authenticate` no mount; RBAC POR ROTA dentro do router
    // (GET->quick_reply:read, POST/PUT/DELETE->quick_reply:manage), mesmo
    // padrao de ai-profile/analytics. Error handler escopado ao path (D17).
    const quickReplies = createQuickRepliesComposition(prisma, logger);
    app.use(
      '/api/tenants/:tenantId/sessions/:sessionName/quick-replies',
      authenticate,
      quickReplies.quickReplyRouter,
    );
    app.use(
      '/api/tenants/:tenantId/sessions/:sessionName/quick-replies',
      quickReplies.quickReplyErrorHandler,
    );

    // Redesign 2026-08-05 (R4) — tags: catálogo por sessão + atribuição por
    // conversa, mesmo service. RBAC POR ROTA dentro de cada router
    // (tag:read/tag:manage no catálogo, message:send na atribuição).
    const tags = createTagsComposition(prisma, logger);
    app.use('/api/tenants/:tenantId/sessions/:sessionName/tags', authenticate, tags.tagRouter);
    app.use('/api/tenants/:tenantId/sessions/:sessionName/tags', tags.tagErrorHandler);
    app.use(
      '/api/tenants/:tenantId/conversations/:conversationId/tags',
      authenticate,
      tags.conversationTagRouter,
    );
    app.use('/api/tenants/:tenantId/conversations/:conversationId/tags', tags.tagErrorHandler);

    // Fase L, Bloco L1b — contatos: TENANT-WIDE (não por sessão), mesmo
    // racional de Tags acima. RBAC POR ROTA dentro do router
    // (contact:read na listagem, contact:manage na importação).
    const contacts = createContactsComposition(prisma, logger);
    app.use('/api/tenants/:tenantId/contacts', authenticate, contacts.contactsRouter);
    app.use('/api/tenants/:tenantId/contacts', contacts.contactsErrorHandler);

    // Redesign 2026-08-05 (R5) — resumo de conversa pela IA, SÍNCRONO (não
    // passa pela fila BullMQ do autoresponder): `apps/api` (este processo)
    // instancia seu PRÓPRIO `AiProviderFactoryImpl`, independente do que
    // `worker.ts` monta — gerar um resumo é `fetch` puro ao provider, sem
    // Baileys/socket, então não viola a ADR #54 (ela só proíbe o *worker* de
    // tocar o Baileys). Degrada graciosamente (mesmo padrão de
    // `mediaDownloader`/`INTERNAL_API_SECRET` acima): sem as credenciais do
    // provider escolhido, o endpoint continua montado, mas
    // `ConversationSummaryService.generateSummary()` lança um erro claro
    // (503, ver `conversationSummaryErrorHandler`) em vez de a API inteira
    // recusar subir por causa de uma feature opcional.
    const summaryProviderName = (process.env.AI_PROVIDER ?? 'claude') as 'claude' | 'gemini';
    const summaryAiProvider = (() => {
      try {
        if (summaryProviderName === 'gemini') {
          const { GEMINI_API_KEY, AI_GEMINI_MODEL, AI_GEMINI_MAX_TOKENS } = process.env;
          if (!GEMINI_API_KEY || !AI_GEMINI_MODEL) return undefined;
          return new AiProviderFactoryImpl(
            {
              gemini: {
                apiKey: GEMINI_API_KEY,
                model: AI_GEMINI_MODEL,
                maxTokens: AI_GEMINI_MAX_TOKENS ? Number(AI_GEMINI_MAX_TOKENS) : undefined,
              },
            },
            logger.child({ module: 'gemini-provider' }),
          ).create('gemini');
        }
        const { CLAUDE_API_KEY, AI_CLAUDE_MODEL, AI_CLAUDE_MAX_TOKENS } = process.env;
        if (!CLAUDE_API_KEY || !AI_CLAUDE_MODEL) return undefined;
        return new AiProviderFactoryImpl({
          claude: {
            apiKey: CLAUDE_API_KEY,
            model: AI_CLAUDE_MODEL,
            maxTokens: AI_CLAUDE_MAX_TOKENS ? Number(AI_CLAUDE_MAX_TOKENS) : undefined,
          },
        }).create('claude');
      } catch {
        return undefined;
      }
    })();
    if (!summaryAiProvider) {
      console.warn(
        `Credenciais do provider "${summaryProviderName}" ausentes: resumo de conversa por IA desabilitado (ver .env.example) — o restante da API segue funcionando normalmente.`,
      );
    }
    const conversationSummaryService = new ConversationSummaryService(
      conversationRepository,
      messageRepository,
      aiInteractionRepository,
      summaryProviderName,
      logger.child({ module: 'conversation-summary' }),
      summaryAiProvider,
    );
    app.use(
      '/api/tenants/:tenantId/conversations',
      authenticate,
      createConversationSummaryRouter(conversationSummaryService),
    );
    app.use('/api/tenants/:tenantId/conversations', createConversationSummaryErrorHandler(logger));

    // Fase 1, Bloco F1.10 (observabilidade mínima para o beta) — `/health`
    // (topo deste arquivo) é uma checagem de LIVENESS deliberadamente burra
    // (sempre 200, sem tocar dependência nenhuma — correto para um probe de
    // "o processo está de pé"). Faltava uma checagem de READINESS: "o
    // sistema está FUNCIONANDO de verdade" — Postgres respondendo, Redis
    // respondendo, e quantos jobs de IA estão parados na fila (sinal direto
    // de "a IA está atrasada/travada" antes que um operador precise notar
    // pela demora nas respostas). Sem métricas/dashboard novo — só um
    // endpoint JSON simples, do jeito mais barato de responder "o sistema
    // está funcionando?" pedido explicitamente pelo fundador.
    app.get('/health/ready', async (_req: Request, res: Response) => {
      const checks: {
        database: 'ok' | 'down';
        redis: 'ok' | 'down';
        aiQueue?: { waiting: number; active: number; failed: number; delayed: number };
      } = { database: 'down', redis: 'down' };

      try {
        await prisma.$queryRaw`SELECT 1`;
        checks.database = 'ok';
      } catch {
        // fica 'down' — não deixa a checagem inteira derrubar a resposta.
      }

      try {
        const counts = await aiReplyQueue.getJobCounts('waiting', 'active', 'failed', 'delayed');
        checks.redis = 'ok';
        checks.aiQueue = {
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        };
      } catch {
        // fica 'down'/`aiQueue` ausente — Redis inacessível ou fila não
        // respondeu; não deixa a checagem inteira derrubar a resposta.
      }

      const healthy = checks.database === 'ok' && checks.redis === 'ok';
      res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', checks });
    });

    shutdownHandles = { prisma, outboundWorker, aiReplyProducerConnection };
  } catch (error) {
    console.error('Falha ao montar rotas de sessão do WhatsApp:', error);
  }
}

/**
 * Encerramento gracioso (Milestone 3, Bloco 5 — D7): fecha, nesta ordem, o
 * `Worker` outbound (espera o job em andamento terminar — mesma garantia
 * nativa do BullMQ já usada em `worker.ts`), depois a conexão Redis
 * produtora de `ai-reply`, depois o Prisma. No modo degradado (sem
 * `REDIS_URL`), `outboundWorker`/`aiReplyProducerConnection` estão ausentes
 * e só `prisma.$disconnect()` roda.
 */
async function shutdown(): Promise<void> {
  if (!shutdownHandles) {
    return;
  }
  const { prisma, outboundWorker, aiReplyProducerConnection } = shutdownHandles;

  if (outboundWorker) {
    await outboundWorker.close();
  }
  if (aiReplyProducerConnection) {
    await aiReplyProducerConnection.quit();
  }
  await prisma.$disconnect();
}

const whatsAppRoutesReady = mountWhatsAppSessionsRoutes();

// Só sobe o servidor quando este arquivo é executado diretamente (node/tsx),
// não quando é importado (ex.: pelos testes, que só precisam do `app`).
// Aguarda `whatsAppRoutesReady` antes de aceitar conexões, para que nenhuma
// requisição chegue antes das rotas estarem montadas (evita 404 espúrio
// numa janela de corrida entre `listen()` e o mount assíncrono acima).
if (require.main === module) {
  whatsAppRoutesReady.finally(() => {
    const port = process.env.PORT || 4000;
    const server = app.listen(port, () => {
      console.log(`API listening on http://localhost:${port}`);
      // Deliberadamente DEPOIS de `listen` e sem `await`: reconectar sockets
      // do WhatsApp pode levar vários segundos, e a API precisa já estar
      // respondendo (inclusive `/health`) enquanto isso acontece.
      // `restoreConnectedSessions` nunca rejeita, mas o `.catch` fica como
      // rede de segurança contra unhandled rejection.
      restoreConnectedSessions().catch((error) => {
        console.warn('Restauração de sessões falhou', error);
      });
    });

    // Milestone 3, Bloco 5 (D7) — primeiro handler de `SIGTERM`/`SIGINT`
    // deste processo. Para de aceitar novas conexões HTTP (`server.close`),
    // então libera os recursos de fila/banco (`shutdown()`), só então
    // encerra o processo — evita interromper um job outbound no meio (entre
    // `sendMessage()` e `linkMessage()`, ver `OutboundCommandConsumer`) por
    // causa de um redeploy/`docker stop`.
    const gracefulShutdown = (): void => {
      console.log('apps/api encerrando graciosamente...');
      server.close(() => {
        shutdown()
          .then(() => process.exit(0))
          .catch((error) => {
            console.error('Falha ao encerrar apps/api graciosamente:', error);
            process.exit(1);
          });
      });
    };
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  });
}
