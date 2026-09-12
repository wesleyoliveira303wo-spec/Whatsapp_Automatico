import { PrismaClient } from '@prisma/client';
import { RequestHandler } from 'express';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Logger } from '../../shared/domain/Logger';
import { AesGcmCipher } from '../../shared/security/infrastructure/AesGcmCipher';
import { PrismaCredentialsStore } from '../../shared/security/infrastructure/PrismaCredentialsStore';
import { HmacSha256ApiKeyHasher } from '../../shared/security/infrastructure/HmacSha256ApiKeyHasher';
import { PrismaTenantRepository } from '../../shared/tenant/infrastructure/PrismaTenantRepository';
import { PrismaWhatsAppSessionRepository } from './infrastructure/repositories/PrismaWhatsAppSessionRepository';
import { PrismaWhatsAppSessionEventRepository } from './infrastructure/repositories/PrismaWhatsAppSessionEventRepository';
import { PrismaAuditLogRepository } from '../auth/infrastructure/repositories/PrismaAuditLogRepository';
import { BaileysProviderFactory } from './infrastructure/providers/baileys/BaileysProviderFactory';
import { WhatsAppConnectionRegistry } from './application/WhatsAppConnectionRegistry';
import { WhatsAppSessionService } from './application/WhatsAppSessionService';
import { ContactAvatarService } from './application/ContactAvatarService';
import { WhatsAppGroupDirectoryService } from './application/WhatsAppGroupDirectoryService';
import { PrismaContactAvatarCacheRepository } from './infrastructure/repositories/PrismaContactAvatarCacheRepository';
import { RegistryContactAvatarSource } from './infrastructure/RegistryContactAvatarSource';
import { MessageReceivedHandler } from './domain/handlers/MessageReceivedHandler';
import { createRequireApiKey } from '../../shared/presentation/requireApiKey';
import { OutboundCommandConsumer } from './infrastructure/OutboundCommandConsumer';
import {
  WHATSAPP_OUTBOUND_QUEUE_NAME,
  WhatsAppOutboundJobData,
} from './infrastructure/queues/WhatsAppOutboundQueue';
import { ConversationRepository } from '../conversations/domain/repositories/ConversationRepository';
import { MessageRepository } from '../conversations/domain/repositories/MessageRepository';
import { StageClassificationScheduler } from '../conversations/domain/schedulers/StageClassificationScheduler';
import { AiInteractionRepository } from '../ai/domain/repositories/AiInteractionRepository';
import { WhatsAppMediaDownloader } from './infrastructure/WhatsAppMediaDownloader';
import { WhatsAppMediaSender } from './infrastructure/WhatsAppMediaSender';
import { SessionOwnAvatarRefresher } from './infrastructure/SessionOwnAvatarRefresher';

/**
 * Composition root do módulo WhatsApp (Item 5, Bloco 8): monta a cadeia real
 * Cipher -> CredentialsStore -> ProviderFactory -> Repository -> Registry a
 * partir das implementações concretas de Infrastructure. Único lugar do
 * código de produção que conhece todas elas ao mesmo tempo — Domain,
 * Application e Presentation continuam dependendo só das portas.
 *
 * Função pura em relação a `process.env` (quem lê variáveis é `index.ts`) —
 * mantém isto testável com um `PrismaClient` qualquer, sem depender de
 * ambiente configurado.
 *
 * Mantida INALTERADA na Production Hardening (Bloco 7): continua sendo o
 * único lugar que conhece a cadeia Cipher->CredentialsStore->ProviderFactory
 * ->Repository->Registry, e continua sendo usada e testada isoladamente
 * (`compositionRoot.test.ts`). `createWhatsAppSessionsComposition`, abaixo,
 * a REAPROVEITA em vez de duplicar essa construção.
 *
 * M2, Fase 2 (M2-B4) — a ASSINATURA desta função (parâmetros/retorno)
 * continua INALTERADA (ADR #45 preservada); só o CORPO ganhou uma linha a
 * mais (`eventRepository`), porque o construtor de `WhatsAppConnectionRegistry`
 * em si mudou (novo 4º parâmetro, repassado ao `SessionManager` — ver
 * docstring de ambos). Diferente do caso de `sessionRepository`/
 * `credentialsStore` na Fase 1 (que só precisavam por causa do
 * `WhatsAppSessionService`, fora desta função): aqui a mudança é
 * estruturalmente inevitável — não existe forma de `new
 * WhatsAppConnectionRegistry(...)` continuar compilando com sua nova
 * assinatura sem esta função passar o 4º argumento.
 *
 * Milestone 3, Bloco 5 (D5 do levantamento arquitetural) — ganhou um 5º
 * parâmetro OPCIONAL, `messageReceivedHandler`, repassado direto ao
 * construtor de `WhatsAppConnectionRegistry`. EXCEÇÃO FORMAL à nota acima e à
 * ADR #45: registrada porque é estritamente aditiva (parâmetro opcional, no
 * fim) — todo chamador existente (`compositionRoot.test.ts`,
 * `createWhatsAppSessionsComposition` abaixo, produção) continua compilando
 * sem qualquer alteração. Sem este parâmetro, `MessageIngestionService`
 * (Milestone 3, Bloco 2, pronto desde então) nunca chegaria a nenhum
 * `SessionManager` real — ver `MessageIngestionService`, docstring: "ainda
 * não wired em nenhum composition root real; isso é Bloco 5".
 */
export function createWhatsAppSessionsRegistry(
  prisma: PrismaClient,
  credentialsMasterKey: string,
  logger: Logger,
  messageReceivedHandler?: MessageReceivedHandler,
): WhatsAppConnectionRegistry {
  const cipher = new AesGcmCipher(credentialsMasterKey);
  const credentialsStore = new PrismaCredentialsStore(prisma, cipher);
  // Fase 1, Bloco F1.1 (ADR #90): mesma instância de `cipher` já usada para
  // `TenantCredential` é reaproveitada para cifrar `mediaKey` — um único
  // segredo derivado por tenant, não dois mecanismos de cifragem paralelos.
  const providerFactory = new BaileysProviderFactory(credentialsStore, logger, undefined, cipher);
  const repository = new PrismaWhatsAppSessionRepository(prisma);
  const eventRepository = new PrismaWhatsAppSessionEventRepository(prisma);
  return new WhatsAppConnectionRegistry(
    providerFactory,
    repository,
    logger,
    eventRepository,
    messageReceivedHandler,
  );
}

/**
 * Peças que `index.ts` precisa para montar o fluxo HTTP protegido
 * (Production Hardening, Bloco 7): o `WhatsAppSessionService` para o router
 * (Bloco 5) e o middleware `requireApiKey` já pronto (Bloco 6), para montar
 * IMEDIATAMENTE ANTES do router, no mesmo path (`/api/tenants/:tenantId/...`).
 *
 * Deliberadamente NÃO inclui o `Router` em si — construir o `Router` (Express,
 * `req`/`res`) é responsabilidade de Presentation
 * (`createWhatsAppSessionsRouter`), não do composition root. Devolver só
 * `sessionService`/`requireApiKey` mantém essa fronteira: quem decide COMO
 * essas peças viram rotas Express continua sendo `index.ts` + o próprio
 * router — o composition root só monta o GRAFO de dependências concretas.
 *
 * Milestone 3, Bloco 5 — ganhou `registry`: `createOutboundCommandConsumerWorker`
 * (D7) precisa da MESMA instância de `WhatsAppConnectionRegistry` usada por
 * `sessionService` (é um pool com estado em memória — duas instâncias
 * distintas do Registry veriam sessões diferentes). Antes do Bloco 5,
 * nenhum consumidor externo precisava do Registry em si, só do
 * `sessionService`; agora precisa, então ele é exposto aqui em vez de
 * reconstruído em outro lugar (o que criaria um SEGUNDO pool, quebrando a
 * garantia de instância única por sessão).
 */
export interface WhatsAppSessionsComposition {
  sessionService: WhatsAppSessionService;
  requireApiKey: RequestHandler;
  registry: WhatsAppConnectionRegistry;
  /**
   * Fase 1, Bloco F1.1 (ADR #90) — implementação real do port
   * `MediaDownloader` (`services/whatsapp/domain`), pronta para
   * `index.ts` injetar em `ConversationsService.setMediaDownloader()`. Só
   * pode ser construída aqui (depende de `registry`, que não existe antes
   * deste composition root rodar) — ver comentário do parâmetro
   * `mediaDownloader` em `ConversationsService` para o porquê completo da
   * injeção tardia.
   */
  mediaDownloader: WhatsAppMediaDownloader;
  /**
   * Fase 1, Bloco F1.3 — implementação real do port `MediaSender`
   * (`services/whatsapp/domain`), pronta para `index.ts` injetar em
   * `ConversationsService.setMediaSender()`. Mesmo motivo de
   * `mediaDownloader` (depende de `registry`, injeção tardia).
   */
  mediaSender: WhatsAppMediaSender;
  /**
   * Bloco B2 (issue #13) — serve as fotos de perfil das listas a partir do
   * cache no Postgres, atualizando o que venceu fora do caminho da
   * requisição, com teto de concorrência. Construído aqui pelo mesmo motivo
   * de `mediaDownloader`/`mediaSender`: depende do `registry`.
   */
  contactAvatarService: ContactAvatarService;
  /**
   * Disparos em grupos (2026-09-11) — lista os grupos de uma sessão (cache
   * curto + deduplicação, ver docstring da classe). Construído aqui pelo
   * mesmo motivo de `contactAvatarService`: depende do `registry`.
   */
  groupDirectoryService: WhatsAppGroupDirectoryService;
}

/**
 * Composição completa do módulo (Production Hardening, Bloco 7): estende a
 * cadeia de `createWhatsAppSessionsRegistry` (reaproveitada, não duplicada)
 * com as peças de tenant/autenticação dos Blocos 1-6 — `PrismaTenantRepository`,
 * `HmacSha256ApiKeyHasher`, `WhatsAppSessionService` e `requireApiKey` — todas
 * construídas aqui, no único lugar do código de produção que conhece
 * simultaneamente Infrastructure (Prisma, crypto) e as portas que consomem.
 *
 * `sessionService` e `requireApiKey` compartilham a MESMA instância de
 * `PrismaTenantRepository` (mesmo `prisma`, sem estado próprio, então isso
 * não introduz acoplamento indevido) — ambos precisam responder pela mesma
 * fonte de verdade de "quais tenants existem", e criar duas instâncias
 * separadas não traria nenhum benefício, só uma alocação supérflua.
 *
 * M2, Fase 1 — `sessionService` ganhou duas dependências novas
 * (`WhatsAppSessionRepository`/`CredentialsStore`, ver docstring de
 * `WhatsAppSessionService`). Deliberadamente NÃO alterei a assinatura de
 * `createWhatsAppSessionsRegistry()` para expor as instâncias que ela já
 * constrói internamente (`credentialsStore`/`repository`) — essa função tem
 * uma nota explícita da Production Hardening dizendo que deve permanecer
 * INALTERADA (ADR #45), e seu contrato já é usado e testado isoladamente em
 * `compositionRoot.test.ts`. Em vez disso, `cipher`/`credentialsStore`/
 * `sessionRepository` são reconstruídos aqui, mais uma vez — ambas as
 * classes envolvidas (`AesGcmCipher`, `PrismaCredentialsStore`,
 * `PrismaWhatsAppSessionRepository`) são wrappers sem estado próprio (só
 * guardam a referência de `prisma`/`cipher` recebida), então ter uma segunda
 * instância delas não introduz nenhum comportamento divergente — é uma
 * pequena duplicação de construção aceita conscientemente em troca de não
 * tocar num contrato já protegido por decisão anterior.
 *
 * M2, Fase 2 (M2-B4/B5) — mesmo padrão: `eventRepository` é reconstruído
 * aqui (uma segunda instância de `PrismaWhatsAppSessionEventRepository`,
 * também um wrapper sem estado próprio) para o `WhatsAppSessionService`
 * responder `getSessionHistory()`, em vez de expor a instância já criada
 * dentro de `createWhatsAppSessionsRegistry()`.
 *
 * Milestone 3, Bloco 5 — ganhou um 5º parâmetro opcional,
 * `messageReceivedHandler`, só repassado adiante para
 * `createWhatsAppSessionsRegistry()` (mesmo racional de extensão aditiva de
 * D5). `index.ts` passa aqui o `MessageIngestionService` construído por
 * `createConversationsComposition()` — ordem de composição documentada em
 * `index.ts` (D15).
 */
export function createWhatsAppSessionsComposition(
  prisma: PrismaClient,
  credentialsMasterKey: string,
  apiKeyPepper: string,
  logger: Logger,
  messageReceivedHandler?: MessageReceivedHandler,
): WhatsAppSessionsComposition {
  const registry = createWhatsAppSessionsRegistry(
    prisma,
    credentialsMasterKey,
    logger,
    messageReceivedHandler,
  );

  const tenantRepository = new PrismaTenantRepository(prisma);
  const apiKeyHasher = new HmacSha256ApiKeyHasher(apiKeyPepper);
  const cipher = new AesGcmCipher(credentialsMasterKey);
  const credentialsStore = new PrismaCredentialsStore(prisma, cipher);
  const sessionRepository = new PrismaWhatsAppSessionRepository(prisma);
  const eventRepository = new PrismaWhatsAppSessionEventRepository(prisma);
  const auditLogRepository = new PrismaAuditLogRepository(prisma);

  const sessionService = new WhatsAppSessionService(
    registry,
    tenantRepository,
    logger,
    sessionRepository,
    credentialsStore,
    eventRepository,
    auditLogRepository,
  );
  const requireApiKey = createRequireApiKey(apiKeyHasher, tenantRepository, logger);
  const mediaDownloader = new WhatsAppMediaDownloader(registry);
  const mediaSender = new WhatsAppMediaSender(registry);

  // Bloco B2 (issue #13): a fonte ao vivo usa `registry.peek` — atualizar um
  // cache auxiliar nunca pode instanciar uma sessão que não estava de pé.
  const contactAvatarService = new ContactAvatarService(
    new PrismaContactAvatarCacheRepository(prisma),
    new RegistryContactAvatarSource(registry),
    logger,
  );
  // 2026-09-12 — injeção tardia (ver docstring de `setOwnAvatarRefresher`):
  // fecha a lacuna de a foto de perfil da PRÓPRIA sessão nunca ser pedida ao
  // WhatsApp (o gatilho normal, desde a mudança de 2026-09-05, é o CONTATO
  // mandar mensagem — e a sessão nunca manda mensagem para si mesma).
  registry.setOwnAvatarRefresher(new SessionOwnAvatarRefresher(contactAvatarService, logger));

  const groupDirectoryService = new WhatsAppGroupDirectoryService(
    registry,
    tenantRepository,
    logger,
  );

  return {
    sessionService,
    requireApiKey,
    registry,
    mediaDownloader,
    mediaSender,
    contactAvatarService,
    groupDirectoryService,
  };
}

/**
 * Constrói e inicia o `Worker` BullMQ que consome a fila `whatsapp-outbound`
 * via `OutboundCommandConsumer` — Milestone 3, Bloco 5 (D7 do levantamento
 * arquitetural). Mesma disciplina de `createWhatsAppSessionsRegistry`: este
 * composition root já é o único lugar que conhece a Infrastructure de
 * "envio" do módulo WhatsApp (ADR #54), e `OutboundCommandConsumer.ts` já
 * importa `ConversationRepository`/`MessageRepository`/`AiInteractionRepository`
 * de outros bounded contexts desde o Bloco 4 — este import aqui não é
 * acoplamento novo, é a extensão natural do que já existia.
 *
 * Recebe `redisConnection` já pronta — não a constrói aqui (D19: quem decide
 * a topologia de conexões Redis do processo HTTP é `index.ts`; esta conexão
 * deve ser distinta da usada pela `Queue` produtora de `ai-reply`, ver
 * `createConversationsComposition`).
 *
 * Devolve o `Worker` para que `index.ts` o guarde e feche no shutdown
 * gracioso (`worker.close()`) — este composition root não decide QUANDO
 * fechar, só como construir.
 */
export function createOutboundCommandConsumerWorker(
  registry: WhatsAppConnectionRegistry,
  conversationRepository: ConversationRepository,
  messageRepository: MessageRepository,
  aiInteractionRepository: AiInteractionRepository,
  logger: Logger,
  redisConnection: IORedis,
  stageClassificationScheduler?: StageClassificationScheduler,
): Worker<WhatsAppOutboundJobData> {
  const consumer = new OutboundCommandConsumer(
    registry,
    conversationRepository,
    messageRepository,
    aiInteractionRepository,
    logger,
  );
  if (stageClassificationScheduler) {
    consumer.setStageClassificationScheduler(stageClassificationScheduler);
  }

  const worker = new Worker<WhatsAppOutboundJobData>(
    WHATSAPP_OUTBOUND_QUEUE_NAME,
    async (job) => {
      await consumer.consume(job.data);
    },
    { connection: redisConnection },
  );

  worker.on('completed', (job) => {
    logger.info('Job whatsapp-outbound concluído', { jobId: job.id });
  });

  // Mesmo critério de observabilidade já aplicado a `worker.ts` (Bloco 4):
  // toda falha TERMINAL de um job (após esgotar os retries do BullMQ) é
  // logada, nunca silenciosa.
  worker.on('failed', (job, error) => {
    logger.error('Job whatsapp-outbound falhou', { jobId: job?.id, error });
  });

  return worker;
}
