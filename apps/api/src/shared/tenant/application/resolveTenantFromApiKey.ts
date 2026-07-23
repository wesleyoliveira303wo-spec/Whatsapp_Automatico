import { ApiKeyHasher } from '../../security/domain/ApiKeyHasher';
import { Tenant } from '../domain/Tenant';
import { TenantRepository } from '../domain/TenantRepository';

/**
 * Resolve o `Tenant` dono de uma API key apresentada em texto plano
 * (Production Hardening, Bloco 6). Função pura — sem Express, sem HTTP, sem
 * estado — deliberadamente NÃO é uma classe/Application Service: a lógica
 * (hashear + buscar por hash) é pequena o bastante para não justificar a
 * cerimônia de uma classe com construtor e injeção de dependência formal
 * (decisão fechada na revisão arquitetural de 2026-07-08 — diferente de
 * `WhatsAppSessionService`, que orquestra quatro operações relacionadas e
 * por isso justifica ser uma classe).
 *
 * Usa `hash()` (não `verify()`): o fluxo aqui é "descobrir QUEM é dono desta
 * chave" via busca indexada por igualdade (`TenantRepository.findByApiKeyHash`,
 * coluna `@unique`) — não "confirmar que uma chave bate com UM hash já
 * conhecido" (esse é o caso de uso de `verify()`, que ninguém tem aqui: não
 * há ainda um tenant candidato antes desta chamada). Calcular o hash uma vez
 * e comparar via índice do banco é o padrão correto para este fluxo, e não
 * introduz risco de timing attack: o valor de alta entropia do HMAC não
 * vaza informação por comparação de igualdade em uma busca indexada, ao
 * contrário de uma comparação byte-a-byte ingênua entre segredos.
 *
 * Retorna `null` tanto para chave vazia/ausente quanto para chave que não
 * corresponde a nenhum tenant — o chamador (`requireApiKey`) decide o que
 * fazer com a ausência, esta função não lança nem gera efeitos colaterais.
 */
export async function resolveTenantFromApiKey(
  apiKeyHasher: ApiKeyHasher,
  tenantRepository: TenantRepository,
  apiKey: string,
): Promise<Tenant | null> {
  if (!apiKey) {
    return null;
  }
  const hash = apiKeyHasher.hash(apiKey);
  return tenantRepository.findByApiKeyHash(hash);
}
