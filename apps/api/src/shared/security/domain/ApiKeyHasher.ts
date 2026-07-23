/**
 * Porta (port) de domínio para hashing de API keys (Production Hardening,
 * Bloco 2). Distinta de `Cipher`: `Cipher` é criptografia REVERSÍVEL
 * (encrypt/decrypt), usada para segredos que precisam ser recuperados em
 * texto plano (ex.: credenciais de sessão do WhatsApp); API keys nunca
 * precisam ser revertidas — só verificadas contra o valor apresentado — por
 * isso esta porta é deliberadamente unidirecional (hash + verify), sem
 * `decrypt`.
 *
 * Algoritmo escolhido (revisão arquitetural de 2026-07-08, quatro rodadas de
 * auditoria adversarial — ver DECISIONS.md): HMAC-SHA256 com pepper, não
 * bcrypt/Argon2/scrypt. Dois motivos, um de performance e um estrutural:
 *
 * 1. API keys são geradas aleatoriamente (alta entropia) — diferente de
 *    senhas humanas. Hash lento/memory-hard (bcrypt/Argon2) existe para
 *    encarecer o brute-force contra segredos de BAIXA entropia; contra alta
 *    entropia não compra segurança adicional, só paga latência em toda
 *    requisição autenticada.
 * 2. bcrypt/Argon2 são NÃO-determinísticos (embutem salt aleatório por
 *    chamada) — `hash(x)` produz valores diferentes a cada execução. Isso é
 *    estruturalmente incompatível com `TenantRepository.findByApiKeyHash(hash)`
 *    (Bloco 1), que depende de igualdade direta contra uma coluna `@unique`
 *    indexada. Com bcrypt/Argon2 seria necessário buscar TODOS os tenants e
 *    comparar um a um, perdendo o lookup O(1) inteiramente — não é só pior
 *    performance, é incompatível com o schema já implementado. HMAC-SHA256 é
 *    determinístico: mesma entrada + mesmo pepper → sempre o mesmo hash.
 *
 * O pepper (segredo do lado do servidor, fora do banco) é defesa em
 * profundidade: mesmo que a coluna `apiKeyHash` vaze sozinha (ex.: backup de
 * banco exposto), um atacante sem o pepper não consegue verificar tentativas
 * nem construir hashes válidos offline.
 */
export interface ApiKeyHasher {
  /** Calcula o hash determinístico de uma API key em texto plano. */
  hash(plainApiKey: string): string;

  /**
   * Verifica se `plainApiKey` corresponde a `storedHash`. Implementações
   * DEVEM usar comparação em tempo constante (ex.: `crypto.timingSafeEqual`)
   * — nunca `===` direto, que vaza informação sobre quantos bytes iniciais
   * coincidem via timing attack. Esse é o motivo de `verify` existir como
   * método explícito do port, em vez de deixar cada chamador reimplementar
   * `hash(x) === storedHash`.
   */
  verify(plainApiKey: string, storedHash: string): boolean;
}
