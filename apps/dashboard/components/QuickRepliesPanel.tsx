import { useState, type FormEvent } from 'react';
import { Trash2, Pencil } from 'lucide-react';
import { useQuickReplies } from '@/hooks/useQuickReplies';
import { ClientApiError } from '@/lib/clientApi';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/states/ErrorState';
import { cn } from '@/lib/utils';

interface QuickRepliesPanelProps {
  sessionName: string;
}

/** Traduz erros de negócio da API para mensagens de UI — mesmo padrão de `UserManagementPanel.tsx`/`AuditLogPanel.tsx`. */
function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 403) return 'Seu cargo não permite gerenciar respostas rápidas.';
    if (error.status === 401) return 'Sessão expirada — faça login novamente.';
    if (error.status === 404) return 'Esta resposta rápida não existe mais.';
  }
  return 'Não foi possível concluir a ação. Tente novamente.';
}

/**
 * Painel de gestão das Respostas Rápidas de uma sessão (Fase 1, Bloco F1.9).
 * Lista simples + criar + editar (inline) + remover. Sem
 * categorização/atalho de teclado (YAGNI, `FASE_1_ANALISE_ESTRATEGICA.md` F1.9).
 * Guardado por papel (Administrator/Owner) na própria página
 * (`pages/sessions/[sessionName]/quick-replies.tsx`) — a barreira real é a
 * API (`quick_reply:manage`).
 *
 * Reskin 2026-08-07 (Design System, tela Cérebro da IA — aba "Respostas
 * Rápidas") — casca própria (fundo+borda, sem `Card`/sombra) em vez do
 * padrão antigo compartilhado com `UserManagementPanel`/`AuditLogPanel`
 * (ainda não reskinados, Passo 5). O campo de nova resposta é uma
 * `Textarea` de 1 linha (`rows={1}`, redimensionamento desligado) — visual
 * idêntico ao `<input>` de linha única do mockup, mas sem impedir colar um
 * texto com quebra de linha (o mockup não modela esse caso; capar para
 * `<input>` de verdade removeria uma capacidade que já existe).
 */
export default function QuickRepliesPanel({ sessionName }: QuickRepliesPanelProps): JSX.Element {
  const {
    quickReplies,
    loading,
    errorMessage: loadError,
    refresh,
    create,
    update,
    remove,
  } = useQuickReplies(sessionName);

  const [newContent, setNewContent] = useState('');
  const [creating, setCreating] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    const trimmed = newContent.trim();
    if (!trimmed) return;
    setCreating(true);
    setPanelError(null);
    try {
      await create(trimmed);
      setNewContent('');
    } catch (error) {
      setPanelError(errorMessageFor(error));
    } finally {
      setCreating(false);
    }
  }

  function startEditing(id: string, content: string): void {
    setEditingId(id);
    setEditingContent(content);
  }

  function cancelEditing(): void {
    setEditingId(null);
    setEditingContent('');
  }

  async function handleSaveEdit(id: string): Promise<void> {
    const trimmed = editingContent.trim();
    if (!trimmed) return;
    setSavingEdit(true);
    setPanelError(null);
    try {
      await update(id, trimmed);
      cancelEditing();
    } catch (error) {
      setPanelError(errorMessageFor(error));
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleRemove(id: string): Promise<void> {
    setPanelError(null);
    try {
      await remove(id);
    } catch (error) {
      setPanelError(errorMessageFor(error));
    }
  }

  return (
    <div>
      <form
        onSubmit={handleCreate}
        className="mb-3.5 flex gap-2 rounded-lg border border-border bg-card p-3.5"
      >
        <label htmlFor="newQuickReplyContent" className="sr-only">
          Nova resposta rápida
        </label>
        <Textarea
          id="newQuickReplyContent"
          value={newContent}
          onChange={(event) => setNewContent(event.target.value)}
          rows={1}
          placeholder="Escreva uma nova resposta pronta…"
          required
          className="h-[34px] flex-1 resize-none rounded-[9px] border-border bg-panel py-2 text-[13px] focus-visible:ring-[3px] focus-visible:ring-primary/10"
        />
        <Button
          type="submit"
          size="cta"
          className="shrink-0"
          disabled={creating || !newContent.trim()}
        >
          {creating ? 'Adicionando…' : 'Adicionar'}
        </Button>
      </form>

      {panelError && <p className="mb-3.5 text-sm text-destructive">{panelError}</p>}

      {/* Onda 1 do redesign (2026-08-22) — mesma correção de `TagsPanel.tsx`: erro de carregamento inicial ganha seu próprio `ErrorState` com retry, distinto do banner de ação. */}
      {loading ? (
        <div className="flex flex-col gap-0 overflow-hidden rounded-lg border border-border bg-card">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : loadError ? (
        <ErrorState description={loadError} onRetry={refresh} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {quickReplies.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhuma resposta rápida cadastrada ainda.
            </p>
          )}
          {quickReplies.map((quickReply, index) => (
            <div
              key={quickReply.id}
              className={cn(
                'flex items-start gap-2.5 px-3.5 py-[13px]',
                index < quickReplies.length - 1 && 'border-b border-border/70',
              )}
              data-testid={`quick-reply-row-${quickReply.id}`}
            >
              {editingId === quickReply.id ? (
                <div className="flex-1 space-y-2">
                  <Textarea
                    value={editingContent}
                    onChange={(event) => setEditingContent(event.target.value)}
                    rows={2}
                    className="rounded-[9px] border-border bg-panel text-[13px]"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={savingEdit || !editingContent.trim()}
                      onClick={() => void handleSaveEdit(quickReply.id)}
                    >
                      {savingEdit ? 'Salvando…' : 'Salvar'}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={cancelEditing}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="flex-1 whitespace-pre-wrap text-[13px] leading-[1.5] text-foreground-secondary">
                    {quickReply.content}
                  </p>
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      aria-label="Editar"
                      onClick={() => startEditing(quickReply.id, quickReply.content)}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Excluir"
                      onClick={() => void handleRemove(quickReply.id)}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
