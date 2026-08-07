import path from 'path';
import dotenv from 'dotenv';

/**
 * Script de diagnóstico (uso manual, não faz parte do runtime): lista os
 * modelos Gemini que a chave `GEMINI_API_KEY` do `.env` PODE de fato usar,
 * com foco nos que suportam `generateContent` (os que servem para responder
 * leads). Serve para descobrir o id exato a colocar em `AI_GEMINI_MODEL` sem
 * chutar — modelos entram/saem do free tier e diferem por conta.
 *
 * Rodar (na raiz do monorepo ou em apps/api):
 *   npx tsx apps/api/src/scripts/listGeminiModels.ts
 *
 * Mesmo caminho de `.env` dos outros scripts desta pasta (`issueApiKey.ts`):
 * `../../../../.env` a partir de __dirname (este arquivo está em
 * `apps/api/src/scripts/`, um nível mais fundo que `worker.ts`), então
 * funciona rodando com cwd em apps/api ou na raiz.
 */
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

interface GeminiModel {
  name?: string;
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
}
interface ListModelsResponse {
  models?: GeminiModel[];
}

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('ERRO: GEMINI_API_KEY não encontrada no .env');
    process.exit(1);
  }

  const url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200';
  const response = await fetch(url, { headers: { 'x-goog-api-key': apiKey } });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`ERRO: a API respondeu ${response.status}: ${body}`);
    process.exit(1);
  }

  const data = (await response.json()) as ListModelsResponse;
  const models = data.models ?? [];

  // Só os que suportam generateContent (os úteis para responder mensagens).
  const usable = models.filter((m) =>
    (m.supportedGenerationMethods ?? []).includes('generateContent'),
  );

  console.log(
    `\nModelos disponíveis para ESTA chave que suportam generateContent (${usable.length}):\n`,
  );
  for (const model of usable) {
    // `name` vem como "models/gemini-x" — o id para AI_GEMINI_MODEL é a parte
    // depois de "models/".
    const id = (model.name ?? '').replace(/^models\//, '');
    console.log(`  ${id}`);
    if (model.displayName) {
      console.log(`     ↳ ${model.displayName}`);
    }
  }
  console.log(
    '\nCopie um id da linha acima (ex.: gemini-3.5-flash) para AI_GEMINI_MODEL no .env.\n',
  );
}

main().catch((error) => {
  console.error('Falha inesperada:', error);
  process.exit(1);
});
