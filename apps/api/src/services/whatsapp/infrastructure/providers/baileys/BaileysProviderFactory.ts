import { Logger } from '../../../../../shared/domain/Logger';
import { CredentialsStore } from '../../../../../shared/security/domain/CredentialsStore';
import { WhatsAppProvider } from '../../../domain/providers/WhatsAppProvider';
import { WhatsAppProviderFactory } from '../../../domain/providers/WhatsAppProviderFactory';
import { BaileysProvider } from './BaileysProvider';
import {
  ReconnectionPolicyConfig,
  DEFAULT_RECONNECTION_POLICY_CONFIG,
  WhatsAppReconnectionPolicy,
} from './WhatsAppReconnectionPolicy';

/**
 * Implementacao concreta de `WhatsAppProviderFactory` sobre `BaileysProvider`
 * (Milestone 1, Item 5 - Bloco 2).
 *
 * Recebe `credentialsStore`/`logger` uma unica vez no construtor -
 * dependencias compartilhadas entre TODAS as sessoes deste processo (o
 * mesmo `CredentialsStore`/`Logger` real, ja composto uma vez no
 * composition root) - e as repassa a cada `BaileysProvider` criado.
 * `tenantId`/`sessionName` sao o unico dado que varia por chamada de
 * `create()`, exatamente como o construtor de `BaileysProvider` ja espera.
 *
 * Nao faz cache: cada `create()` sempre devolve uma instancia NOVA (ver
 * docstring do port `WhatsAppProviderFactory`) - decidir se uma instancia
 * deve ser reaproveitada e responsabilidade de quem consome esta factory
 * (o futuro `WhatsAppConnectionRegistry`, Bloco 5), nunca dela mesma.
 *
 * `reconnectionPolicyConfig` (Production Hardening, Bloco 8b): recebido uma
 * única vez no construtor (com um default sensato — `DEFAULT_RECONNECTION_POLICY_CONFIG`
 * — para não obrigar todo chamador a informar), mas uma NOVA instância de
 * `WhatsAppReconnectionPolicy` é criada a cada `create()`, uma por sessão —
 * o estado de backoff/circuit breaker (falhas consecutivas, circuito aberto)
 * é por sessão, nunca compartilhado entre tenants/sessões (ver docstring do
 * port `ReconnectionPolicy`). Compartilhar a CONFIG (números) é seguro e
 * intencional; compartilhar a POLÍTICA (estado) não seria.
 */
export class BaileysProviderFactory implements WhatsAppProviderFactory {
  constructor(
    private readonly credentialsStore: CredentialsStore,
    private readonly logger: Logger,
    private readonly reconnectionPolicyConfig: ReconnectionPolicyConfig = DEFAULT_RECONNECTION_POLICY_CONFIG,
  ) {}

  create(tenantId: string, sessionName: string): WhatsAppProvider {
    const reconnectionPolicy = new WhatsAppReconnectionPolicy(this.reconnectionPolicyConfig, this.logger);
    return new BaileysProvider(tenantId, sessionName, this.credentialsStore, this.logger, reconnectionPolicy);
  }
}
