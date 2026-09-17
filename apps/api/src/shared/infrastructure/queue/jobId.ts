/**
 * Monta um `jobId` de BullMQ a partir de partes soltas.
 *
 * POR QUE ISTO EXISTE (2026-09-17). O BullMQ recusa um `jobId` que contenha
 * `:` e não tenha EXATAMENTE 3 partes — a regra vive em `job.js`
 * (`validateOptions`) e é um resquício de compatibilidade com jobs
 * repetíveis. Quando ela dispara, `queue.add()` LANÇA, e quem chamou
 * costuma estar num caminho onde a exceção some: foi assim que os balões 2+
 * de toda resposta da IA deixaram de ser enviados por semanas sem ninguém
 * notar (2026-08-21), e foi por um fio que o mesmo não derrubou todo o
 * agendamento de IA — a chave antiga tinha 3 partes por coincidência.
 *
 * A regra aqui é simples: nenhuma chave montada por este projeto contém `:`.
 * As partes são unidas por `-` e qualquer `:` vindo de dentro de uma parte
 * vira `_`. Na prática os ids são UUIDs e nada é substituído; a troca existe
 * para que um identificador inesperado degrade para uma chave feia — nunca
 * para uma exceção invisível.
 */
export function buildJobId(...parts: readonly string[]): string {
  return parts.map((part) => part.replace(/:/g, '_')).join('-');
}
