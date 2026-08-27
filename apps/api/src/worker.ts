import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

import { PrismaConversationRepository } from './services/conversations/infrastructure/repositories/PrismaConversationRepository';
import { PrismaMessageRepository } from './services/conversations/infrastructure/repositories/PrismaMessageRepository';
import {
  AI_REPLY_QUEUE_NAME,
  AiReplyJobData,
} from './services/conversations/infrastructure/queues/AiReplyQueue';
import { PrismaAiInteractionRepository } from './services/ai/infrastructure/repositories/PrismaAiInteractionRepository';
import { PrismaAiBusinessProfileRepository } from './services/ai/infrastructure/repositories/PrismaAiBusinessProfileRepository';
import { PrismaAiPreferencesRepository } from './services/ai/infrastructure/repositories/PrismaAiPreferencesRepository';
import { PrismaCampaignRepository } from './services/campaigns/infrastructure/repositories/PrismaCampaignRepository';
import { CampaignOriginResolverImpl } from './services/campaigns/infrastructure/CampaignOriginResolverImpl';
import { AiFaqReaderImpl } from './services/aiFaq/infrastructure/AiFaqReaderImpl';
import { PrismaAiFaqRepository } from './services/aiFaq/infrastructure/repositories/PrismaAiFaqRepository';
import { AiProviderFactoryImpl } from './services/ai/infrastructure/AiProviderFactoryImpl';
import { AiProviderName } from './services/ai/domain/providers/AiProviderName';
import { PromptBuilder } from './services/ai/application/PromptBuilder';
import { ConversationAiService } from './services/ai/application/ConversationAiService';
import { AiReplyJobProcessor } from './services/ai/application/AiReplyJobProcessor';
import { getPromptVersion } from './services/ai/domain/PromptVersion';
import {
  WHATSAPP_OUTBOUND_QUEUE_NAME,
  WhatsAppOutboundJobData,
} from './services/whatsapp/infrastructure/queues/WhatsAppOutboundQueue';
import { BullMqOutboundMessageDispatcher } from './services/whatsapp/infrastructure/dispatchers/BullMqOutboundMessageDispatcher';
import { HttpMediaDownloader } from './services/whatsapp/infrastructure/HttpMediaDownloader';
import { ConsoleLogger } from './shared/infrastructure/logging/ConsoleLogger';
import { KeyedMutex } from './shared/infrastructure/concurrency/KeyedMutex';

// Mesmo racional de `index.ts`: caminho absoluto calculado a partir de
// `__dirname`, não de `process.cwd()` — necessário porque `npm run dev:worker
// -w apps/api` roda este arquivo com cwd = `apps/api/`, não a raiz do
// monorepo.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Entrypoint do worker de IA — Milestone 3, Bloco 4 (decisão D1 do
 * levantamento arquitetural pré-Bloco 4, confirmada pelo usuário): vive em
 * `apps/api/src/worker.ts`, MESMO pacote/workspace de `apps/api` (não um
 * workspace npm `apps/worker` separado, como um esboço anterior do
 * `MILESTONE_003_AI_AUTORESPONDER.md` §2.5-B sugeria) — reaproveita
 * diretamente todo o código de `services/ai/`/`services/conversations/` já
 * existente, sem precisar extrair um novo workspace `packages/` compartilhado
 * só para isso. Sobe como um PROCESSO Node separado do `index.ts` (dois
 * `CMD`/entrypoints distintos sobre a MESMA imagem Docker — Bloco 4e), não um
 * segundo papel dentro do processo HTTP.
 *
 * DIFERENÇA DELIBERADA frente a `mountWhatsAppSessionsRoutes()`
 * (`index.ts`): lá, os imports de módulos que tocam Baileys (ESM puro) são
 * DINÂMICOS, porque `index.ts` é importado por `health.test.ts` mesmo quando
 * as variáveis de ambiente de WhatsApp não estão configuradas — um import
 * estático quebraria a suíte inteira. Este arquivo (`worker.ts`) não é
 * importado por NENHUM teste (não exporta nada útil para testar; toda a
 * lógica de orquestração testável já foi extraída para
 * `AiReplyJobProcessor`, testado isoladamente com Fakes) — por isso os
 * imports acima são ESTÁTICOS, mais simples de ler. Isso também é uma
 * garantia adicional da fronteira da ADR #54: nenhum destes imports toca
 * `WhatsAppConnectionRegistry`/`WhatsAppProvider`/Baileys — só Prisma,
 * BullMQ, ioredis e os components de `services/ai`/`services/conversations`
 * já existentes, mais o PRODUTOR (não o consumidor) da fila
 * `whatsapp-outbound`.
 *
 * `main()` falha rápido (`process.exit(1)`) se alguma variável de ambiente
 * obrigatória estiver ausente — diferente do padrão "degrada
 * silenciosamente" de `mountWhatsAppSessionsRoutes()` em `index.ts` (que
 * loga um aviso e segue sem montar as rotas, porque `/health` ainda precisa
 * funcionar). Aqui não existe um "modo degradado" sensato: a ÚNICA razão de
 * existir deste processo é rodar o pipeline de IA — sem `CLAUDE_API_KEY`,
 * por exemplo, não há nada de útil para este processo fazer além de existir
 * ocioso, o que só mascararia um erro de configuração de deploy.
 */
/**
 * Providers de IA com implementação real HOJE (ver `AiProviderName.ts`). O
 * `AI_PROVIDER` da env é validado contra esta lista — `'openai'` existe no TIPO
 * mas ainda não tem adapter, então não é selecionável em runtime.
 */
const SUPPORTED_PROVIDERS: AiProviderName[] = ['claude', 'gemini'];

async function main(): Promise<void> {
  const {
    DATABASE_URL,
    REDIS_URL,
    AI_PROVIDER,
    CLAUDE_API_KEY,
    AI_CLAUDE_MODEL,
    AI_CLAUDE_MAX_TOKENS,
    GEMINI_API_KEY,
    AI_GEMINI_MODEL,
    AI_GEMINI_MAX_TOKENS,
    AI_PROMPT_VERSION,
    AI_HISTORY_LIMIT,
    INTERNAL_API_SECRET,
    INTERNAL_API_BASE_URL,
  } = process.env;

  // `AI_PROVIDER` default 'claude' — compatibilidade total com deploys
  // anteriores à M6, que não conheciam esta variável.
  const selectedProvider = (AI_PROVIDER ?? 'claude') as AiProviderName;
  if (!SUPPORTED_PROVIDERS.includes(selectedProvider)) {
    console.error(
      `worker: AI_PROVIDER="${AI_PROVIDER}" inválido. Valores suportados: ${SUPPORTED_PROVIDERS.join(', ')} (ver .env.example).`,
    );
    process.exit(1);
  }

  // Variáveis base sempre obrigatórias + as credenciais do provider ESCOLHIDO.
  // Não exigimos as credenciais do provider não usado: rodar só com Gemini (free
  // tier em dev) não deve exigir uma chave da Anthropic, e vice-versa.
  const baseRequired: Array<[string, string | undefined]> = [
    ['DATABASE_URL', DATABASE_URL],
    ['REDIS_URL', REDIS_URL],
  ];
  const providerRequired: Array<[string, string | undefined]> =
    selectedProvider === 'gemini'
      ? [
          ['GEMINI_API_KEY', GEMINI_API_KEY],
          ['AI_GEMINI_MODEL', AI_GEMINI_MODEL],
        ]
      : [
          ['CLAUDE_API_KEY', CLAUDE_API_KEY],
          ['AI_CLAUDE_MODEL', AI_CLAUDE_MODEL],
        ];

  const missing = [...baseRequired, ...providerRequired]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    console.error(
      `worker: variáveis de ambiente obrigatórias ausentes: ${missing.join(', ')} (ver .env.example).`,
    );
    process.exit(1);
  }

  const logger = new ConsoleLogger({ module: 'ai-worker' });

  const prisma = new PrismaClient();
  const conversationRepository = new PrismaConversationRepository(prisma);
  const messageRepository = new PrismaMessageRepository(prisma);
  const aiInteractionRepository = new PrismaAiInteractionRepository(prisma);
  const aiBusinessProfileRepository = new PrismaAiBusinessProfileRepository(prisma);

  // Só o provider escolhido é configurado na factory — os demais nem entram no
  // mapa (pedir um provider não configurado lança AiProviderNotSupportedError).
  const aiProviderFactory = new AiProviderFactoryImpl(
    {
      claude:
        selectedProvider === 'claude'
          ? {
              apiKey: CLAUDE_API_KEY as string,
              model: AI_CLAUDE_MODEL as string,
              maxTokens: AI_CLAUDE_MAX_TOKENS ? Number(AI_CLAUDE_MAX_TOKENS) : undefined,
            }
          : undefined,
      gemini:
        selectedProvider === 'gemini'
          ? {
              apiKey: GEMINI_API_KEY as string,
              model: AI_GEMINI_MODEL as string,
              maxTokens: AI_GEMINI_MAX_TOKENS ? Number(AI_GEMINI_MAX_TOKENS) : undefined,
            }
          : undefined,
    },
    logger.child({ module: 'gemini-provider' }),
  );

  // Fase 1, Bloco F1.2 (interpretação de mídia pela IA) — OPCIONAL: sem
  // `INTERNAL_API_SECRET`/`INTERNAL_API_BASE_URL` configurados, o worker
  // segue funcionando exatamente como antes deste bloco (a IA só recebe a
  // descrição factual de mídia, nunca o binário) — nunca um erro fatal por
  // esta variável estar ausente, diferente das variáveis base/de provider
  // (degradação graciosa, mesmo padrão de `aiBusinessProfileRepository`).
  const mediaDownloader =
    INTERNAL_API_SECRET && INTERNAL_API_BASE_URL
      ? new HttpMediaDownloader(
          INTERNAL_API_BASE_URL,
          INTERNAL_API_SECRET,
          logger.child({ module: 'media-downloader' }),
        )
      : undefined;
  if (!mediaDownloader) {
    logger.warn(
      'INTERNAL_API_SECRET/INTERNAL_API_BASE_URL ausentes: interpretação de mídia pela IA desabilitada (ver .env.example) — a IA continua reconhecendo mídia por texto (Bloco F1.1).',
    );
  }

  // Fase L, Bloco L6 — descobre se a conversa nasceu de campanha e injeta o
  // bloco de contexto correspondente. Puro leitor de Postgres (nunca toca
  // Baileys), então pode ser construído aqui direto, sem injeção tardia
  // vinda de `apps/api/index.ts` (diferente de `campaignReplyTracker`, que
  // precisa do `WhatsAppConnectionRegistry`, único no processo HTTP).
  const campaignOriginResolver = new CampaignOriginResolverImpl(
    new PrismaCampaignRepository(prisma),
    logger.child({ module: 'campaign-origin-resolver' }),
  );

  // Cérebro da IA v3, Fase 2 (2026-08-25) — mesmo racional de
  // `campaignOriginResolver`: puro leitor de Postgres, construído aqui direto.
  const aiFaqReader = new AiFaqReaderImpl(
    new PrismaAiFaqRepository(prisma),
    logger.child({ module: 'ai-faq-reader' }),
  );

  // Cérebro da IA v3, Fase 3 (2026-08-26) — Preferências: mesma instância
  // usada tanto para injetar o bloco de contexto no prompt (abaixo) quanto
  // para `AiReplyJobProcessor` resolver a mensagem customizada de
  // encaminhamento (mais abaixo).
  const aiPreferencesRepository = new PrismaAiPreferencesRepository(prisma);

  const conversationAiService = new ConversationAiService(
    aiProviderFactory,
    selectedProvider,
    new PromptBuilder(),
    aiInteractionRepository,
    undefined,
    // Base de Conhecimento (Nível 1): injeta o perfil de negócio do tenant no
    // prompt. `undefined` acima mantém o `maxReplyLength` no default.
    aiBusinessProfileRepository,
    mediaDownloader,
    campaignOriginResolver,
    // Feature de transcrição de áudio (2026-08-24) — `messageRepository` já
    // existe neste escopo (usado por `AiReplyJobProcessor` mais abaixo).
    messageRepository,
    aiFaqReader,
    aiPreferencesRepository,
  );
  const promptVersion = getPromptVersion(AI_PROMPT_VERSION ?? 'v1');

  // `maxRetriesPerRequest: null` é exigido pelo próprio BullMQ para
  // conexões usadas por um `Worker` (comandos bloqueantes de polling da
  // fila) — sem isso, o `ioredis` aplicaria seu próprio limite de retry e
  // o `Worker` derrubaria a conexão silenciosamente em cenários de Redis
  // lento/instável. Aplicado também à conexão do `Queue` produtor
  // (`whatsapp-outbound`) por consistência, mesmo não sendo estritamente
  // obrigatório para produtores — evita duas convenções diferentes de
  // conexão dentro do mesmo processo.
  const workerConnection = new IORedis(REDIS_URL as string, { maxRetriesPerRequest: null });
  const outboundConnection = new IORedis(REDIS_URL as string, { maxRetriesPerRequest: null });

  // CORREÇÃO 2026-08-18: esta é a Queue REAL usada pelas respostas da IA
  // (`AiReplyJobProcessor`, abaixo) — a fila `whatsapp-outbound` também é
  // construída em `services/conversations/compositionRoot.ts`, mas aquela
  // instância serve só o processo `apps/api` (envio manual do operador, N2);
  // as respostas da IA passam por AQUI, dentro de `worker.ts`. Sem
  // `attempts` configurado, o BullMQ usa o default de 1 tentativa — uma
  // reconexão momentânea do socket Baileys na hora do envio derrubava a
  // mensagem PERMANENTEMENTE e em SILÊNCIO (a IA já tinha gerado a resposta
  // com sucesso; só o envio falhava, sem nenhum sinal ao cliente/operador).
  // Ver a mesma correção espelhada em `conversations/compositionRoot.ts`.
  const outboundQueue = new Queue<WhatsAppOutboundJobData>(WHATSAPP_OUTBOUND_QUEUE_NAME, {
    connection: outboundConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: 500,
    },
  });
  const outboundMessageDispatcher = new BullMqOutboundMessageDispatcher(outboundQueue);

  const processor = new AiReplyJobProcessor(
    conversationRepository,
    messageRepository,
    conversationAiService,
    outboundMessageDispatcher,
    promptVersion,
    logger,
    // Fase 1 (2026-08-07) — Botão POWER: mesma instância já construída acima
    // para `ConversationAiService` (Cérebro da IA) — re-checagem do estado
    // ATUAL antes de gerar a resposta (ver docstring de `process()`).
    aiBusinessProfileRepository,
    AI_HISTORY_LIMIT ? Number(AI_HISTORY_LIMIT) : undefined,
    // Cérebro da IA v3, Fase 3 (2026-08-26): 4 params intermediários no
    // default (humanHandoffMessage/handoffNoticeRepeatAfterMs/now/sessionGapMs)
    // para alcançar `aiPreferencesRepository`, mesma instância já construída
    // acima para `ConversationAiService`.
    undefined,
    undefined,
    undefined,
    undefined,
    aiPreferencesRepository,
  );

  // Fase 1, Bloco F1.10 (estabilidade para beta) — a auditoria pré-beta
  // encontrou o worker rodando com concorrência PADRÃO do BullMQ (= 1),
  // processando o `ai-reply` de TODOS os tenants em série: um tenant com
  // burst de mensagens atrasava a IA de todos os outros.
  //
  // `concurrency: 5` libera até 5 jobs em voo ao mesmo tempo DENTRO deste
  // processo. Isso é seguro entre CONVERSAS diferentes (cada uma só toca a
  // própria linha em `WhatsAppConversation`/`WhatsAppMessage`), mas não é
  // seguro dentro da MESMA conversa: duas mensagens inbound próximas geram
  // dois jobs distintos (o `jobId` de idempotência do BullMQ é por
  // `messageId`, não por `conversationId` — ver `BullMqAiReplyScheduler`),
  // e processá-los ao mesmo tempo faria duas chamadas concorrentes a
  // `ConversationAiService.generateReply()` lerem o MESMO histórico (a
  // resposta da primeira ainda não persistida) — duas respostas
  // conflitantes, dois `updateStage` correndo por cima um do outro.
  //
  // `conversationMutex` (ver `KeyedMutex`) resolve exatamente isso:
  // serializa jobs da MESMA `tenantId:conversationId` (a chave inclui o
  // tenant para nunca colidir entre tenants diferentes por acidente),
  // enquanto libera paralelismo total entre conversas/tenants diferentes —
  // "paralelo entre conversas, serial dentro da mesma conversa", como
  // pedido. `shouldAutoRespond()`/Botão POWER continuam sendo re-checados
  // DENTRO de `processor.process()` a cada execução, agora com a garantia
  // adicional de que essa checagem nunca lê um estado sendo escrito por
  // outro job da mesma conversa ao mesmo tempo.
  const conversationMutex = new KeyedMutex();

  const worker = new Worker<AiReplyJobData>(
    AI_REPLY_QUEUE_NAME,
    async (job) => {
      const conversationKey = `${job.data.tenantId}:${job.data.conversationId}`;
      await conversationMutex.run(conversationKey, () => processor.process(job.data));
    },
    { connection: workerConnection, concurrency: 5 },
  );

  worker.on('completed', (job) => {
    logger.info('Job ai-reply concluído', { jobId: job.id, ...job.data });
  });

  // Critério de aceite explícito do `MILESTONE_003_AI_AUTORESPONDER.md` §5
  // ("Fila sem observabilidade vira uma caixa-preta"): toda falha TERMINAL
  // de um job (depois de esgotar os retries do BullMQ) é logada via o
  // `Logger` port — nunca silenciosa. `job` pode ser `undefined` em alguns
  // cenários de erro do próprio BullMQ (ex.: falha ao buscar o job) —
  // guardado explicitamente, mesmo padrão defensivo já usado em
  // `BaileysProvider` para eventos que podem chegar sem payload completo.
  worker.on('failed', (job, error) => {
    logger.error('Job ai-reply falhou', { jobId: job?.id, ...job?.data, error });
  });

  logger.info('Worker de IA iniciado', {
    queue: AI_REPLY_QUEUE_NAME,
    promptVersion: promptVersion.id,
  });

  /**
   * Encerramento gracioso: aguarda o job em andamento (se houver) terminar
   * antes de fechar as conexões — `Worker.close()` do BullMQ já implementa
   * essa espera nativamente. Sem isto, um `docker stop`/`SIGTERM` do
   * orquestrador (Kubernetes, docker-compose) poderia interromper um job
   * de IA no meio (ex.: entre gerar a resposta e despachar o comando
   * outbound), perdendo trabalho já pago (tokens da Anthropic já
   * consumidos) sem nunca enviar a mensagem correspondente.
   */
  const shutdown = async (): Promise<void> => {
    logger.info('Worker de IA encerrando...');
    await worker.close();
    await outboundQueue.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => {
    shutdown().catch((error) => {
      console.error('Falha ao encerrar o worker de IA graciosamente:', error);
      process.exit(1);
    });
  });
  process.on('SIGINT', () => {
    shutdown().catch((error) => {
      console.error('Falha ao encerrar o worker de IA graciosamente:', error);
      process.exit(1);
    });
  });
}

main().catch((error) => {
  console.error('Falha fatal ao iniciar o worker de IA:', error);
  process.exit(1);
});
