import { useCallback, useEffect, useState } from 'react';
import { fetchAuditLogs, ClientApiError, type AuditLogEntry } from '@/lib/clientApi';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/states/ErrorState';

/**
 * Mesma casca visual dos outros campos de Configurações — `<select>` nativo
 * (não o `ui/select` de Radix: a interação de escolher uma ação nos testes
 * já existentes depende de `fireEvent.change` num `<select>` de verdade, que
 * o Radix não expõe — trocar quebraria a única cobertura de teste real desse
 * filtro, sem ganho visual perceptível já que o mockup também é só um
 * `<select>` simples).
 */
const NATIVE_SELECT_CLASSES =
  'h-[34px] rounded-[9px] border border-border bg-card px-2.5 text-[12.5px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Cor do texto por categoria de ação (reskin 2026-08-07) — falhas em vermelho, o resto no tom padrão de texto; nenhuma lógica de negócio depende disso. */
function actionTextClassName(action: string): string {
  if (action.endsWith('.failure')) return 'text-destructive';
  return 'text-foreground';
}

/**
 * Traduz o catálogo de `action` (string livre definida pelos produtores dos
 * eventos — `AuthService`/`UserManagementService`/`ConversationsService`/
 * `WhatsAppSessionService`, ver `AuditLogRepository.ts`) para um rótulo em
 * português. Uma ação fora do mapa (produtor novo, ainda não catalogado
 * aqui) cai no fallback — nunca quebra a tela, só mostra a string crua.
 */
const ACTION_LABELS: Record<string, string> = {
  'auth.login.success': 'Login',
  'auth.login.failure': 'Tentativa de login falhou',
  'auth.logout': 'Logout',
  'auth.password_change.failure': 'Troca de senha falhou',
  'auth.password_changed': 'Senha alterada',
  'user.created': 'Usuário criado',
  'user.role_changed': 'Cargo alterado',
  'user.suspended': 'Usuário suspenso',
  'user.reactivated': 'Usuário reativado',
  'user.password_reset': 'Senha redefinida (RH)',
  'conversation.agent_message': 'Mensagem enviada pelo operador',
  'conversation.agent_media_message': 'Mídia enviada pelo operador',
  'conversation.escalated': 'Conversa assumida por humano',
  'conversation.resumed': 'Conversa devolvida ao bot',
  'conversation.stage_changed': 'Estágio do Pipeline alterado',
  'conversation.excluded_from_pipeline': 'Conversa marcada como fora do funil comercial',
  'conversation.included_in_pipeline': 'Conversa devolvida ao funil comercial',
  'session.created': 'Sessão WhatsApp criada',
  'session.disconnected_by_user': 'Sessão desconectada',
  'session.removed': 'Sessão removida',
};

function actionLabelFor(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function formatOccurredAt(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 403) return 'Sem permissão para ver a auditoria.';
    if (error.status === 401) return 'Sessão expirada — faça login novamente.';
  }
  return 'Não foi possível carregar a auditoria. Tente novamente.';
}

/**
 * Painel de auditoria (Fase 1, Bloco F1.5 — "o livro da portaria" ganha uma
 * tela). Só leitura: lista + filtros por ator/ação + paginação por cursor —
 * a trilha em si (`record`) é escrita internamente pelos bounded contexts,
 * nunca por aqui.
 *
 * Reskin 2026-08-07 (Design System, tela Configurações — aba "Auditoria") —
 * `<table>` cru trocado por `ui/table` (mesmo racional de
 * `UserManagementPanel.tsx`). O mockup tem só 3 colunas (Quando/Ação/
 * Usuário); mantida a 4ª coluna real "Alvo" (`targetType`/`targetId`) — dado
 * de auditoria de verdade que o mockup não modela, não descartado.
 */
export default function AuditLogPanel(): JSX.Element {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [panelError, setPanelError] = useState<string | null>(null);

  const [actionFilter, setActionFilter] = useState<string>('');

  const load = useCallback(async (action: string) => {
    setLoading(true);
    setPanelError(null);
    try {
      const page = await fetchAuditLogs({ limit: 50, action: action || undefined });
      setEntries(page.entries);
      setNextCursor(page.nextCursor);
    } catch (error) {
      setPanelError(errorMessageFor(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(actionFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMore(): Promise<void> {
    if (!nextCursor) return;
    try {
      const page = await fetchAuditLogs({
        limit: 50,
        cursor: nextCursor,
        action: actionFilter || undefined,
      });
      setEntries((current) => [...current, ...page.entries]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      setPanelError(errorMessageFor(error));
    }
  }

  const knownActions = Object.keys(ACTION_LABELS);

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <label htmlFor="auditActionFilter" className="sr-only">
          Filtrar por ação
        </label>
        <select
          id="auditActionFilter"
          value={actionFilter}
          onChange={(event) => {
            setActionFilter(event.target.value);
            void load(event.target.value);
          }}
          className={NATIVE_SELECT_CLASSES}
        >
          <option value="">Todas as ações</option>
          {knownActions.map((action) => (
            <option key={action} value={action}>
              {actionLabelFor(action)}
            </option>
          ))}
        </select>
      </div>

      {/* Onda 1 do redesign (2026-08-22) — mesma correção de `UserManagementPanel.tsx`: falha SEM nenhum dado para mostrar vira `ErrorState` com retry; falha com dado antigo ainda em tela (ex.: troca de filtro que falhou) continua um banner discreto. */}
      {panelError && entries.length > 0 && (
        <p className="mb-3.5 text-sm text-destructive">{panelError}</p>
      )}

      {loading ? (
        <div className="flex flex-col gap-0 overflow-hidden rounded-lg border border-border bg-card">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : panelError && entries.length === 0 ? (
        <ErrorState description={panelError} onRetry={() => void load(actionFilter)} />
      ) : (
        /* SEM `overflow-x-auto` — ver docstring equivalente em `UserManagementPanel.tsx` (mesmo achado/correção). */
        <div className="rounded-lg border border-border bg-card">
          <Table className="min-w-[520px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[130px] px-4">Quando</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead className="w-[200px]">Usuário</TableHead>
                <TableHead className="px-4">Alvo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id} data-testid={`audit-log-row-${entry.id}`}>
                  <TableCell className="whitespace-nowrap px-4 text-muted-foreground">
                    {formatOccurredAt(entry.occurredAt)}
                  </TableCell>
                  <TableCell className={actionTextClassName(entry.action)}>
                    {actionLabelFor(entry.action)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.actorUserId ?? '—'}
                  </TableCell>
                  <TableCell className="px-4 text-muted-foreground">
                    {entry.targetType
                      ? `${entry.targetType}${entry.targetId ? ` · ${entry.targetId}` : ''}`
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {entries.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Nenhum evento de auditoria ainda.</p>
          )}
        </div>
      )}
      {!loading && nextCursor && (
        <button
          type="button"
          onClick={() => void loadMore()}
          className="mt-2.5 h-[34px] w-full rounded-[10px] border border-border text-[12.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Carregar mais
        </button>
      )}
    </div>
  );
}
