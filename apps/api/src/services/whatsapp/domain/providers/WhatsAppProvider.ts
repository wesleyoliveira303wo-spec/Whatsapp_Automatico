import { WhatsAppSession } from '../entities/WhatsAppSession';
import { WhatsAppProviderEvent } from './WhatsAppProviderEvent';

/**
 * Porta (port) do Domain para qualquer provedor de conexão WhatsApp.
 * A Application (SessionManager) depende apenas deste contrato — nunca de
 * uma implementação concreta. A Infrastructure (ex.: um provider baseado em
 * Baileys) implementa esta interface, respeitando a direção de dependência
 * da Clean Architecture (Infrastructure → Domain, nunca o inverso).
 */
export interface WhatsAppProvider {
  /** Inicia a conexão com o WhatsApp (ex.: abre o socket do Baileys). */
  connect(): Promise<void>;

  /** Encerra a conexão ativa. */
  disconnect(): Promise<void>;

  /**
   * Status atual da conexão, no mesmo vocabulário de `WhatsAppSession.status`.
   * Uso: leitura pontual/síncrona (ex.: logo após `connect()`). Para reagir a
   * mudanças que acontecem depois, sem nova chamada da Application, use
   * `onEvent`.
   */
  getStatus(): Promise<WhatsAppSession['status']>;

  /** QR Code atual para pareamento (string a ser renderizada como imagem/ASCII). */
  getQRCode(): Promise<string>;

  /** Número de telefone associado à sessão conectada, se disponível. */
  getPhoneNumber(): Promise<string | undefined>;

  /**
   * Envia uma mensagem de texto para `to` (JID do destinatário, ex.:
   * `"5511999999999@s.whatsapp.net"`) através da sessão desta instância
   * (Milestone 3, Bloco 1). `to` é um dado de CADA chamada (o destinatário
   * varia por mensagem), não uma identidade da instância — diferente de
   * `tenantId`/`sessionName`, que continuam fixados na construção (ver
   * restrição da ADR #29 sobre `SessionManager`, que não se aplica aqui: o
   * destinatário nunca foi a identidade que este port fixa).
   *
   * Lança `WhatsAppNotConnectedError` se a sessão não estiver com uma
   * conexão viva no momento da chamada — nunca envia "melhor esforço" sobre
   * um socket ausente ou parcialmente conectado.
   */
  sendMessage(to: string, content: string): Promise<void>;

  /**
   * Registra um listener para eventos assíncronos do provider (ex.: Baileys
   * confirmando pareamento após o QR ser escaneado, uma queda inesperada de
   * sessão, ou — no futuro — QR atualizado, mensagem recebida, presence).
   * Necessário porque provedores reais são orientados a eventos, não a
   * request/response puro.
   *
   * Recebe uma união discriminada (`WhatsAppProviderEvent`) em vez de um
   * método dedicado por tipo de evento — assim, novos tipos de evento se
   * tornam apenas um novo membro da união, sem exigir um novo método aqui
   * nem mudar a assinatura deste método (Open/Closed Principle; corrige o
   * achado F2 do Architecture Gate Review, que apontou o desenho anterior
   * como falso-OCP).
   *
   * Cada instância de `WhatsAppProvider` corresponde a exatamente uma
   * sessão/socket, então há apenas um listener ativo por vez — chamar este
   * método novamente substitui o listener anterior, não acumula (evita a
   * complexidade de um EventEmitter multi-assinante, desnecessária neste
   * escopo; revisitar se um dia houver múltiplos consumidores).
   */
  onEvent(listener: (event: WhatsAppProviderEvent) => void): void;
}
