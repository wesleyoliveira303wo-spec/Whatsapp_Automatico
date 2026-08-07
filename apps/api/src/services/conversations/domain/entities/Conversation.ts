/**
 * Conversa lógica entre um contato do WhatsApp e um tenant — Milestone 3,
 * Bloco 2. Chave lógica única: `tenantId` + `sessionName` + `contactJid` (ver
 * `@@unique` em `prisma/schema.prisma`, model `WhatsAppConversation`).
 *
 * `status` controla se a IA responde automaticamente a novas mensagens desta
 * conversa (`'bot'`) ou se um humano assumiu o atendimento (`'human'`) — ver
 * `domain/policies/shouldAutoRespond.ts`. Tipado como união literal, não
 * `string` livre, mesmo racional do achado F6/ADR #15 já aplicado a
 * `WhatsAppSession.status`/`WhatsAppSession.provider`.
 *
 * Reforma do escalonamento (2026-07-25): `status` só vira `'human'` por uma
 * AÇÃO HUMANA explícita (`POST .../conversations/:id/escalate`, "Assumir
 * conversa") — a IA pedindo ajuda (marcador de escalonamento, ou falha ao
 * gerar resposta) NÃO muda mais `status`; ela sinaliza isso só via
 * `escalatedAt`, continuando a responder normalmente enquanto ninguém
 * assume. Antes desta reforma, a própria IA colocava a conversa em
 * `'human'` sem dono ao escalar — isso a tirava do circuito e podia deixar
 * o cliente sem resposta nenhuma até um humano aparecer; ver `escalatedAt`
 * para o desenho atual.
 */
export interface Conversation {
  id: string;
  tenantId: string;
  sessionName: string;
  contactJid: string;
  /**
   * Nome de exibição do WhatsApp (`pushName`, Milestone 6, Bloco M6H-2b) —
   * `undefined` até a primeira mensagem inbound que o carregar. Ver
   * `PrismaConversationRepository.upsertByTenantSessionAndContact`: uma
   * mensagem SEM nome nunca apaga um nome já salvo, só uma mensagem COM nome
   * atualiza (o contato pode mudar o nome de exibição no WhatsApp).
   */
  contactName?: string;
  status: 'bot' | 'human';
  /**
   * Dono atual do atendimento (Milestone 5, Bloco M5D — ownership, D57): o
   * `userId` de quem ASSUMIU a conversa (`escalate`), ou `undefined` quando
   * ninguem assumiu (ex.: conversa nova, ou retomada pelo bot). Coluna
   * aditiva criada no M5A; passa a ser preenchida/lida a partir do M5D.
   * Referencia por id (sem entidade `User` — o contexto de conversas nao
   * conhece o de auth), mesmo principio de `AiInteraction.conversationId`.
   */
  assignedToUserId?: string;
  /**
   * Reforma do escalonamento (2026-07-25) — quando a IA pediu atenção
   * humana pela ÚLTIMA vez (marcador de escalonamento ou falha ao gerar
   * resposta), SEM tirar a IA do circuito: `status` continua `'bot'` nesse
   * momento (`shouldAutoRespond` segue `true`), a IA continua tentando
   * responder novas mensagens desta conversa. `undefined` = ninguém pediu
   * ajuda desde a última vez que um humano assumiu (ou a conversa nunca
   * escalou). Só é limpo quando um humano de fato assume
   * (`ConversationsService.escalateConversation`) — nunca pelo bot sozinho.
   * Ver `AiReplyJobProcessor` (quem seta) e `useWaitingForHuman` no
   * dashboard (quem lê, para o alerta/badge "aguardando atendente").
   */
  escalatedAt?: Date;
  /**
   * Indicador de não lidas (2026-07-25) — quantas mensagens INBOUND
   * chegaram desde a última vez que um humano abriu esta conversa pela
   * Dashboard. Incrementado por `MessageIngestionService` a cada mensagem
   * inbound persistida; zerado por `ConversationsService.markAsRead()`
   * quando o operador abre a conversa. Mensagens outbound (IA ou operador)
   * nunca incrementam. Sempre >= 0.
   */
  unreadCount: number;
  /**
   * Pipeline de CRM (Milestone 6, Bloco M6H-5, 2026-07-30) — estágio no
   * funil de vendas. Funil fixo de 5 estágios (2 terminais), não
   * customizável por tenant nesta rodada. Toda conversa nasce em `'new'`.
   * Gravado por ação humana explícita (`ConversationsService.updateStage`,
   * sempre permitida) ou pela IA junto com cada resposta gerada
   * (`AiReplyJobProcessor`, só quando `stageSetBy === 'ai'` — ver policy
   * `shouldAiUpdateStage`).
   */
  stage: 'new' | 'contacted' | 'negotiating' | 'closed_won' | 'closed_lost';
  /**
   * Quem gravou `stage` pela última vez (Milestone 6, Bloco M6H-5). Começa
   * `'ai'` — a IA classifica livremente até que um humano corrija
   * manualmente pela primeira vez (`updateStage`), a partir daí a IA nunca
   * mais sobrescreve aquela conversa (evita o card "voltar sozinho" no
   * board Kanban depois de uma correção humana).
   */
  stageSetBy: 'ai' | 'human';
  /**
   * Quando `stage` foi gravado pela última vez — independente de
   * `updatedAt` (que qualquer campo bumpa, ver histórico de `markAsRead`),
   * para permitir medir "tempo parado num estágio" sem ambiguidade com
   * outra atividade da conversa.
   */
  stageUpdatedAt: Date;
  /**
   * ADR #94 (2026-08-01, validação Fase 1) — marca esta conversa como FORA
   * do funil comercial (amigo/família/fornecedor/funcionário no mesmo
   * número da empresa). Atributo ORTOGONAL a `stage`/`status`: quando
   * `true`, a IA para de responder automaticamente (ver
   * `shouldAutoRespond`), a conversa some do board Kanban e do funil de
   * Analytics — mas o histórico de mensagens continua acessível
   * normalmente. `false` por padrão (toda conversa nasce dentro do funil
   * comercial). Só um humano marca/desmarca (`ConversationsService.
   * setExcludedFromPipeline`); a IA nunca decide isso sozinha.
   */
  excludedFromPipeline: boolean;
  /**
   * Fase 1, Bloco F1.7 (2026-08-01) — trecho da última mensagem (qualquer
   * direção), para a lista de Conversas. Denormalizado, gravado por
   * `PrismaMessageRepository.create()` (único ponto de escrita — ver
   * `buildMessagePreview`). `undefined` só numa conversa sem nenhuma
   * mensagem ainda (caso de borda improvável na prática).
   */
  lastMessagePreview?: string;
  /** Acompanha `lastMessagePreview` — quando a última mensagem ocorreu. */
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Redesign 2026-08-05 (R4) — tags livres atribuídas a esta conversa (N:N
   * via `WhatsAppConversationTag`, catálogo em `services/tags`). Projeção
   * mínima (não a `Tag` inteira de `services/tags` — este contexto não
   * precisa saber `tenantId`/`sessionName`/timestamps da tag, só o que a UI
   * exibe). Populada por `PrismaConversationRepository` via `include` direto
   * no Postgres — `services/conversations` LÊ a tabela de tags para exibir,
   * mas nunca ESCREVE nela (atribuir/remover é `services/tags`, ver
   * `conversationTagRouter`) — sem dependência de código entre os dois
   * bounded contexts. Sempre um array (nunca `undefined`) — conversa sem
   * tag nenhuma é `[]`.
   */
  tags: ConversationTagRef[];
  /**
   * Redesign 2026-08-05 (R5) — resumo da conversa gerado pela IA sob
   * demanda (nunca automático). `undefined` até a primeira geração. Gravado
   * por `ConversationRepository.updateAiSummary` — nenhuma outra operação
   * desta entidade toca este campo.
   */
  aiSummary?: string;
  /** Acompanha `aiSummary` — quando foi gerado pela última vez. */
  aiSummaryUpdatedAt?: Date;
  /**
   * Quantas mensagens a conversa tinha no momento da última geração de
   * `aiSummary` — comparado com a contagem atual pela UI para acender o
   * aviso de "desatualizado". `0` até a primeira geração.
   */
  aiSummaryMessageCount: number;
}

/** Projeção de `Tag` (`services/tags`) exibida numa `Conversation` — ver docstring do campo `tags` acima. */
export interface ConversationTagRef {
  id: string;
  name: string;
  color: string;
}
