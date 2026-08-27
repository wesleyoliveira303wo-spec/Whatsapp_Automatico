import { useMemo, useState } from 'react';
import { Trash2, Pencil, Search, HelpCircle, Plus } from 'lucide-react';
import { useAiFaqEntries } from '@/hooks/useAiFaqEntries';
import { ClientApiError } from '@/lib/clientApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/states/ErrorState';
import EmptyState from '@/components/states/EmptyState';
import { cn } from '@/lib/utils';

interface AiFaqPanelProps {
  sessionName: string;
}

/** Traduz erros de negócio da API para mensagens de UI — mesmo padrão de `QuickRepliesPanel.tsx`. */
function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 403) return 'Seu cargo não permite gerenciar a FAQ da IA.';
    if (error.status === 401) return 'Sessão expirada — faça login novamente.';
    if (error.status === 404) return 'Esta pergunta não existe mais.';
  }
  return 'Não foi possível concluir a ação. Tente novamente.';
}

interface FaqFormState {
  question: string;
  answer: string;
  category: string;
}

const EMPTY_FORM: FaqFormState = { question: '', answer: '', category: '' };

/**
 * Painel de gestão da FAQ estruturada do Cérebro da IA (v3, Fase 2,
 * 2026-08-25) — substitui o antigo botão "Cadastrar pergunta não
 * respondida" (que só anexava texto cru ao blob de conteúdo). Lista com
 * busca/filtro por categoria + criar + editar (inline) + toggle
 * ativo/inativo + remover. Mesma casca visual de `QuickRepliesPanel.tsx`
 * (lista de linhas em `Card`, sem `<table>`).
 */
export default function AiFaqPanel({ sessionName }: AiFaqPanelProps): JSX.Element {
  const {
    faqEntries,
    loading,
    errorMessage: loadError,
    refresh,
    create,
    update,
    remove,
  } = useAiFaqEntries(sessionName);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const [newForm, setNewForm] = useState<FaqFormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<FaqFormState>(EMPTY_FORM);
  const [savingEdit, setSavingEdit] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const entry of faqEntries) {
      if (entry.category) set.add(entry.category);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [faqEntries]);

  const visibleEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return faqEntries.filter((entry) => {
      if (categoryFilter && entry.category !== categoryFilter) return false;
      if (!query) return true;
      return (
        entry.question.toLowerCase().includes(query) || entry.answer.toLowerCase().includes(query)
      );
    });
  }, [faqEntries, search, categoryFilter]);

  async function handleCreate(): Promise<void> {
    const question = newForm.question.trim();
    const answer = newForm.answer.trim();
    if (!question || !answer) return;
    setCreating(true);
    setPanelError(null);
    try {
      await create(question, answer, newForm.category.trim() || null);
      setNewForm(EMPTY_FORM);
    } catch (error) {
      setPanelError(errorMessageFor(error));
    } finally {
      setCreating(false);
    }
  }

  function startEditing(entry: (typeof faqEntries)[number]): void {
    setEditingId(entry.id);
    setEditingForm({
      question: entry.question,
      answer: entry.answer,
      category: entry.category ?? '',
    });
  }

  function cancelEditing(): void {
    setEditingId(null);
    setEditingForm(EMPTY_FORM);
  }

  async function handleSaveEdit(id: string): Promise<void> {
    const question = editingForm.question.trim();
    const answer = editingForm.answer.trim();
    if (!question || !answer) return;
    setSavingEdit(true);
    setPanelError(null);
    try {
      await update(id, { question, answer, category: editingForm.category.trim() || null });
      cancelEditing();
    } catch (error) {
      setPanelError(errorMessageFor(error));
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleToggleActive(id: string, active: boolean): Promise<void> {
    setPanelError(null);
    try {
      await update(id, { active });
    } catch (error) {
      setPanelError(errorMessageFor(error));
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
      {/*
        BUGFIX 2026-08-27 (mesmo padrão de `AiPreferencesPanel.tsx`) — este
        painel vive dentro do `<form>` de `AiProfilePanel` (aba "FAQ"). Um
        `<form>` próprio aqui ficaria ANINHADO (HTML inválido) e o clique em
        "Adicionar pergunta" disparava uma navegação de página inteira em vez
        do submit esperado. Trocado `<form>`/`onSubmit` por `<div>`/botão
        comum com `onClick`.
      */}
      <div className="mb-3.5 rounded-lg border border-border bg-card p-3.5">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[13.5px] font-semibold text-foreground">Nova pergunta</h2>
            <p className="text-[12px] text-muted-foreground">
              A IA responde com esse texto sempre que a pergunta bater com o que o cliente
              perguntar.
            </p>
          </div>
        </div>
        <div className="space-y-2.5">
          <div>
            <label
              htmlFor="newFaqQuestion"
              className="mb-1 block text-[12px] text-muted-foreground"
            >
              Pergunta
            </label>
            <Input
              id="newFaqQuestion"
              value={newForm.question}
              onChange={(event) => setNewForm((f) => ({ ...f, question: event.target.value }))}
              placeholder="Pergunta que o cliente costuma fazer…"
              required
              className="h-9 text-[13px]"
            />
          </div>
          <div>
            <label htmlFor="newFaqAnswer" className="mb-1 block text-[12px] text-muted-foreground">
              Resposta
            </label>
            <Textarea
              id="newFaqAnswer"
              value={newForm.answer}
              onChange={(event) => setNewForm((f) => ({ ...f, answer: event.target.value }))}
              rows={2}
              placeholder="Resposta que a IA deve usar…"
              required
              className="rounded-[9px] border-border bg-panel text-[13px]"
            />
          </div>
          <div className="flex items-end gap-2.5">
            <div className="min-w-0 flex-1 max-w-[220px]">
              <label
                htmlFor="newFaqCategory"
                className="mb-1 block text-[12px] text-muted-foreground"
              >
                Categoria (opcional)
              </label>
              <Input
                id="newFaqCategory"
                value={newForm.category}
                onChange={(event) => setNewForm((f) => ({ ...f, category: event.target.value }))}
                placeholder="Ex.: Preços"
                className="h-9 text-[13px]"
              />
            </div>
            <Button
              type="button"
              size="cta"
              className="shrink-0"
              disabled={creating || !newForm.question.trim() || !newForm.answer.trim()}
              onClick={() => void handleCreate()}
            >
              {creating ? 'Adicionando…' : 'Adicionar pergunta'}
            </Button>
          </div>
        </div>
      </div>

      {panelError && (
        <p className="mb-3.5 text-sm text-destructive" role="alert" aria-live="polite">
          {panelError}
        </p>
      )}

      {!loading && !loadError && faqEntries.length > 0 && (
        <div className="mb-3.5 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search
              className="pointer-events-none absolute left-[11px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar pergunta ou resposta"
              aria-label="Buscar pergunta ou resposta"
              className="h-9 rounded-[9px] pl-[33px] text-[13px]"
            />
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por categoria">
              <button
                type="button"
                onClick={() => setCategoryFilter(null)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors',
                  categoryFilter === null
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                Todas
              </button>
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setCategoryFilter(category)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors',
                    categoryFilter === category
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground',
                  )}
                >
                  {category}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-0 overflow-hidden rounded-lg border border-border bg-card">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : loadError ? (
        <ErrorState description={loadError} onRetry={refresh} />
      ) : faqEntries.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title="Nenhuma pergunta cadastrada ainda"
          description="Cadastre perguntas que seus clientes costumam fazer, com a resposta que a IA deve usar."
        />
      ) : visibleEntries.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Nenhuma pergunta encontrada para esse filtro.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {visibleEntries.map((entry, index) => (
            <div
              key={entry.id}
              className={cn(
                'flex items-start gap-2.5 px-3.5 py-[13px]',
                index < visibleEntries.length - 1 && 'border-b border-border/70',
                !entry.active && 'opacity-60',
              )}
              data-testid={`faq-row-${entry.id}`}
            >
              {editingId === entry.id ? (
                <div className="flex-1 space-y-2">
                  <Input
                    value={editingForm.question}
                    onChange={(event) =>
                      setEditingForm((f) => ({ ...f, question: event.target.value }))
                    }
                    className="h-9 text-[13px]"
                  />
                  <Textarea
                    value={editingForm.answer}
                    onChange={(event) =>
                      setEditingForm((f) => ({ ...f, answer: event.target.value }))
                    }
                    rows={2}
                    className="rounded-[9px] border-border bg-panel text-[13px]"
                  />
                  <Input
                    value={editingForm.category}
                    onChange={(event) =>
                      setEditingForm((f) => ({ ...f, category: event.target.value }))
                    }
                    placeholder="Categoria (opcional)"
                    className="h-9 max-w-[220px] text-[13px]"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        savingEdit || !editingForm.question.trim() || !editingForm.answer.trim()
                      }
                      onClick={() => void handleSaveEdit(entry.id)}
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
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <p className="break-words text-[13px] font-medium text-foreground">
                        {entry.question}
                      </p>
                      {entry.category && (
                        <Badge variant="outline" className="text-[11px]">
                          {entry.category}
                        </Badge>
                      )}
                      {!entry.active && (
                        <Badge variant="outline" className="text-[11px] text-muted-foreground">
                          Inativa
                        </Badge>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.5] text-foreground-secondary">
                      {entry.answer}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Switch
                      checked={entry.active}
                      onCheckedChange={(checked) => void handleToggleActive(entry.id, checked)}
                      aria-label={entry.active ? 'Desativar pergunta' : 'Ativar pergunta'}
                    />
                    <button
                      type="button"
                      aria-label="Editar"
                      onClick={() => startEditing(entry)}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Excluir"
                      onClick={() => void handleRemove(entry.id)}
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
