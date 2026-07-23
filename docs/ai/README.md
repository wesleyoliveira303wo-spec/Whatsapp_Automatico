# AI Service Documentation

Documentation for the **AI** integration layer (Claude API).

- **Prompt Templates**: Stored under `shared/promptTemplates/`.
- **Service API**: `src/backend/services/ai/aiService.ts` – wrapper around Claude endpoints.
- **Caching**: Redis‑based memoisation of identical prompts.
- **Cost Monitoring**: Token usage events emitted to `AnalyticsEvent`.
- **Safety**: System prompts and content moderation pipeline.
