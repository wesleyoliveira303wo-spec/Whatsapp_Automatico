/**
 * Plano de um `Tenant` — a Trava de plano do Lançamento suave (2026-08-31,
 * ver `CONTEXT.md`).
 *
 * `free`  — só visualização: conecta um WhatsApp e vê as mensagens chegando.
 * `pro`   — uso completo, 1 número.
 * `enterprise` — uso completo, até 5 números.
 *
 * O limite de número de sessões por plano NÃO é imposto em código nesta fase
 * (o fundador controla ao ativar o cliente) — a única regra que o código
 * aplica é a de `planPermiteUso`.
 *
 * Localização em `shared/tenant`: `plan` é um conceito transversal (todo
 * bounded context que precisa travar comportamento por plano lê o mesmo
 * valor). A docstring de `TenantRepository` reserva "lógica RICA de planos"
 * para um bounded context de Administração no futuro — isto aqui é o mínimo
 * (um enum + um predicado de uma linha), não lógica rica; quando o modelo de
 * planos crescer (billing, limites, permissões finas), migra para lá.
 */
export type TenantPlan = 'free' | 'pro' | 'enterprise';
