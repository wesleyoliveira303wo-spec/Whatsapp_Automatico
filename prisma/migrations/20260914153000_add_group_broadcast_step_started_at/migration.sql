-- Marca explícita de quando UMA etapa foi iniciada pela primeira vez
-- (`startBroadcast`) — necessária porque, com etapas em paralelo, nem
-- `runsCompleted` (só incrementa ao FECHAR um ciclo) nem `nextRunAt` (fica
-- nulo tanto "nunca começou" quanto "ciclo em andamento") distinguem sozinhos
-- "nunca rodou" de "já rodou, está entre um ciclo e o próximo".
ALTER TABLE "group_broadcast_steps" ADD COLUMN "started_at" TIMESTAMP(3);
