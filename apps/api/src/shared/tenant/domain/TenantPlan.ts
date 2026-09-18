/**
 * Plano de um `Tenant` (B5, 2026-09-18 — ver `planCapabilities.ts` e
 * `CONTEXT.md`).
 *
 * `free`       — Grátis: conecta um WhatsApp e vê as mensagens chegando.
 * `broadcast`  — Disparos: tudo menos IA, 1 número.
 * `pro`        — Pro: uso completo, 1 número.
 * `enterprise` — Enterprise: uso completo, até 5 números.
 *
 * O que cada plano libera e quantos números aceita vive SÓ em
 * `planCapabilities.ts` — nenhum outro arquivo compara plano por nome.
 *
 * Localização em `shared/tenant`: `plan` é um conceito transversal (todo
 * bounded context que precisa travar comportamento por plano lê o mesmo
 * valor). A cobrança (Stripe, etapas 2 e 3 do B5) vive num bounded context
 * próprio (`services/billing`); aqui fica só o que todos precisam ler.
 */
export type TenantPlan = 'free' | 'broadcast' | 'pro' | 'enterprise';
