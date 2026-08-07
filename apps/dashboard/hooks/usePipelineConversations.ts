import { useCallback, useEffect, useState } from 'react';
import { fetchConversations } from '../lib/clientApi';
import type { ConversationSummary } from '../lib/clientApi';

export interface UsePipelineConversationsResult {
  conversations: ConversationSummary[];
  loading: boolean;
  errorMessage: string | null;
  refresh: () => void;
  /**
   * Sobrescreve LOCALMENTE (otimista) uma conversa já carregada — usado pelo
   * board ao soltar um card numa coluna nova, sem esperar um refetch
   * completo. Mesmo racional de `useConversationsList.applyLocalUpdate`
   * (M6H-2/2b), mas aqui não há um próximo tick de SSE para "expirar" o
   * override sozinho — o board chama `refresh()` depois de confirmar a
   * gravação no servidor (ver `PipelineBoard`), então o override dura só o
   * tempo entre o drop e a resposta da API.
   */
  applyLocalUpdate: (conversation: ConversationSummary) => void;
}

/**
 * Pipeline de CRM (Milestone 6, Bloco M6H-5) — carrega TODAS as conversas de
 * uma sessão para montar o board Kanban. Deliberadamente NÃO usa
 * `useConversationsList` (SSE + paginação por cursor, D23/D24): o board
 * precisa do conjunto completo agrupado por `stage`, não de uma lista
 * incrementalmente carregada e filtrada por `status` — os dois modelos de
 * dado são incompatíveis (um card "Fechado" antigo, por exemplo, nunca
 * apareceria numa lista pensada para status `bot`/`human`).
 *
 * Estratégia: busca por fetch simples (`fetchConversations`, já usado por
 * "Carregar mais" em D24) em loop até `nextCursor` acabar, acumulando tudo
 * em memória — aceitável para o volume de uma sessão de PME (dezenas a
 * poucas centenas de conversas); paginação real do PRÓPRIO board fica para
 * quando houver demanda (YAGNI, mesmo racional documentado em outros
 * blocos deste projeto).
 */
export function usePipelineConversations(sessionName: string): UsePipelineConversationsResult {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadAll(): Promise<void> {
      setLoading(true);
      setErrorMessage(null);
      try {
        const all: ConversationSummary[] = [];
        let cursor: string | undefined;
        do {
          // eslint-disable-next-line no-await-in-loop -- paginação sequencial deliberada, mesmo padrão de "Carregar mais" (D24).
          // ADR #96 (2026-08-01): o board carrega TODAS as conversas da
          // sessão, inclusive as marcadas como fora do funil comercial — elas
          // deixaram de desaparecer da tela e passaram a viver numa coluna
          // própria ("Não cliente"). A ADR #94 filtrava
          // `excludedFromPipeline: false` aqui, o que tornava a marcação
          // invisível e irreversível na prática (nenhuma tela listava as
          // conversas marcadas).
          const page = await fetchConversations({ sessionName, cursor, limit: 100 });
          all.push(...page.conversations);
          cursor = page.nextCursor;
        } while (cursor);
        if (!cancelled) {
          setConversations(all);
        }
      } catch {
        if (!cancelled) {
          setErrorMessage('Falha ao carregar as conversas desta sessão. Tente novamente.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [sessionName, reloadToken]);

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const applyLocalUpdate = useCallback((conversation: ConversationSummary) => {
    setConversations((current) =>
      current.map((item) => (item.id === conversation.id ? conversation : item)),
    );
  }, []);

  return { conversations, loading, errorMessage, refresh, applyLocalUpdate };
}
