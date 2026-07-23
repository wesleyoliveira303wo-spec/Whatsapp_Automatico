import { WhatsAppProvider } from './WhatsAppProvider';

/**
 * Porta (port) do Domain para a criacao de instancias de `WhatsAppProvider`.
 *
 * Existe para que a Application (futuro `WhatsAppConnectionRegistry`, Item
 * 5 - Bloco 5) possa criar um novo provider por par `(tenantId,
 * sessionName)` sem importar nenhuma implementacao concreta de
 * Infrastructure (ex.: `BaileysProvider`) diretamente - isso violaria a
 * direcao de dependencia da Clean Architecture (Application -> Domain,
 * nunca Application -> Infrastructure). Ja estava previsto desde a M1A
 * (M1A.4, ver docs/whatsapp/M1A-ARCHITECTURE-HARDENING.md), mas nunca tinha
 * sido implementado.
 *
 * A implementacao real (`BaileysProviderFactory`, Infrastructure) e o Fake
 * usado em testes (`FakeWhatsAppProviderFactory`) dependem so desta
 * interface - a Application nunca precisa saber qual das duas esta em uso.
 */
export interface WhatsAppProviderFactory {
  /**
   * Cria uma NOVA instancia de `WhatsAppProvider` para o par `(tenantId,
   * sessionName)` informado. Cada chamada retorna uma instancia distinta -
   * esta interface deliberadamente NAO faz cache/reuso de instancias; essa
   * responsabilidade e de quem a consome (ex.: um futuro registry), nao da
   * factory.
   */
  create(tenantId: string, sessionName: string): WhatsAppProvider;
}
