import { Tenant } from './Tenant';

/**
 * Porta (port) do Domain para leitura de `Tenant` (Production Hardening,
 * Bloco 1). Vive em `shared/tenant` — não em `services/whatsapp/domain` —
 * pelo mesmo motivo de `shared/security` (Cipher/CredentialsStore): `Tenant`
 * é um conceito transversal, raiz do multi-tenant (ver ER em `CLAUDE.md`),
 * não algo que pertence ao bounded context do WhatsApp. Colocá-lo dentro de
 * `services/whatsapp/` criaria acoplamento invertido: qualquer módulo futuro
 * (CRM, Auth) que precisasse de `Tenant` teria que importar de dentro do
 * bounded context do WhatsApp.
 *
 * Localização dentro de `shared/` (revisão arquitetural de 2026-07-08,
 * quatro rodadas de auditoria adversarial da Production Hardening):
 * `Tenant` é um conceito de DOMÍNIO DE NEGÓCIO compartilhado entre bounded
 * contexts (um "Shared Kernel", no sentido estrito de DDD) — diferente de
 * `Logger`/`Cipher`/`CredentialsStore`, que são infraestrutura puramente
 * TÉCNICA sem significado de negócio próprio. Coexistir na mesma pasta
 * `shared/` é uma decisão PRAGMÁTICA desta milestone (criar uma categoria
 * nova, ex. `core/`, só para acomodar um único conceito seria abstração
 * prematura — categoria com um membro não é categoria). Esta pasta
 * (`shared/tenant`) permanece deliberadamente mínima por design: qualquer
 * lógica rica de negócio (billing, planos, permissões, múltiplas API keys)
 * pertence a um bounded context PRÓPRIO no futuro (`services/administration`
 * ou equivalente), nunca a uma extensão deste diretório. Esta decisão de
 * localização está FECHADA para esta milestone — só revisitar `core/` (ou
 * outra categoria) se um SEGUNDO conceito de Shared Kernel real aparecer.
 * Não reabrir esta discussão durante a Production Hardening.
 *
 * Somente leitura, de propósito: provisionamento de tenant (`create`) e
 * qualquer `update`/`delete`/`findAll` não têm nenhum consumidor nesta
 * milestone — o provisionamento continua manual (seed/Prisma Studio) até
 * existir uma Milestone de Administração. Adicionar esses métodos agora
 * violaria YAGNI.
 */
export interface TenantRepository {
  findById(id: string): Promise<Tenant | null>;

  /** Usado exclusivamente pelo futuro middleware de autenticação por
   * `X-API-Key`: resolve o tenant dono do hash informado, ou `null` se
   * nenhum tenant tiver essa chave. */
  findByApiKeyHash(hash: string): Promise<Tenant | null>;

  /**
   * Cria um tenant novo (Fase Auth/Registro, 2026-08-26) — a revisão prevista
   * na docstring acima: "revisitar `create` só se houver uma Milestone de
   * Administração/Registro". `apiKeyHash` nasce `null` (emitido depois, se
   * necessário, via `issueApiKey.ts`) — o registro self-service cria só o
   * necessário para o Owner logar (tenant + usuário), nunca uma API key.
   */
  create(input: { name: string }): Promise<Tenant>;

  /**
   * Atualiza o nome do tenant (Reorganizacao Perfil/Configuracoes,
   * 2026-08-27 — aba "Empresa" de Configuracoes). Devolve `undefined` se o
   * id nao existir, mesmo padrao de `UserRepository.update`.
   */
  update(id: string, changes: { name: string }): Promise<Tenant | undefined>;
}
