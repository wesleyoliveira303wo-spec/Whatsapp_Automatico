-- Marca explícita de quando UMA etapa terminou sua recorrência PARA SEMPRE
-- (não repete mais) — necessária porque, com etapas em paralelo, `nextRunAt`
-- sozinho não distingue "ciclo em andamento" de "encerrada de vez". A
-- campanha inteira só vira `completed` quando TODAS as etapas têm
-- `finished_at` preenchido.
ALTER TABLE "group_broadcast_steps" ADD COLUMN "finished_at" TIMESTAMP(3);
