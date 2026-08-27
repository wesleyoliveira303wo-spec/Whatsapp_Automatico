import { useState, type FormEvent } from 'react';
import { Trash2, Pencil } from 'lucide-react';
import { useTags } from '@/hooks/useTags';
import { ClientApiError, TAG_COLORS } from '@/lib/clientApi';
import type { TagColor } from '@/lib/clientApi';
import { tagSwatchClassName, tagBadgeClassName } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/states/ErrorState';

interface TagsPanelProps {
  sessionName: string;
}

/** Traduz erros de negócio da API para mensagens de UI — mesmo padrão de `QuickRepliesPanel.tsx`. */
function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 403) return 'Seu cargo não permite gerenciar tags.';
    if (error.status === 401) return 'Sessão expirada — faça login novamente.';
    if (error.status === 404) return 'Esta tag não existe mais.';
    if (error.status === 409) return 'Já existe uma tag com este nome nesta sessão.';
  }
  return 'Não foi possível concluir a ação. Tente novamente.';
}

interface ColorSwatchPickerProps {
  value: TagColor;
  onChange: (color: TagColor) => void;
}

/** Paleta FIXA de 8 cores (decisão do fundador) — swatches circulares, sem escolha livre de hex. */
function ColorSwatchPicker({ value, onChange }: ColorSwatchPickerProps): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cor da tag">
      {TAG_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          onClick={() => onChange(color)}
          className={cn(
            'h-6 w-6 rounded-full ring-offset-2 ring-offset-background transition-shadow',
            tagSwatchClassName(color),
            value === color ? 'ring-2 ring-foreground' : 'ring-2 ring-transparent',
          )}
        />
      ))}
    </div>
  );
}

/**
 * Painel de gestão do CATÁLOGO de tags de uma sessão (Redesign 2026-08-05,
 * R4). Mesma casca visual de `QuickRepliesPanel.tsx` (Card + lista + criar +
 * editar inline + remover), com o campo extra de cor (paleta fixa de 8).
 * Vive na aba "Tags" de Configurações — guardado por papel
 * (administrator/owner) na própria página; a barreira real é a API
 * (`tag:manage`).
 */
export default function TagsPanel({ sessionName }: TagsPanelProps): JSX.Element {
  const {
    tags,
    loading,
    errorMessage: loadError,
    refresh,
    create,
    update,
    remove,
  } = useTags(sessionName);

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<TagColor>('gray');
  const [creating, setCreating] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState<TagColor>('gray');
  const [savingEdit, setSavingEdit] = useState(false);

  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    setPanelError(null);
    try {
      await create(trimmed, newColor);
      setNewName('');
      setNewColor('gray');
    } catch (error) {
      setPanelError(errorMessageFor(error));
    } finally {
      setCreating(false);
    }
  }

  function startEditing(id: string, name: string, color: TagColor): void {
    setEditingId(id);
    setEditingName(name);
    setEditingColor(color);
  }

  function cancelEditing(): void {
    setEditingId(null);
    setEditingName('');
  }

  async function handleSaveEdit(id: string): Promise<void> {
    const trimmed = editingName.trim();
    if (!trimmed) return;
    setSavingEdit(true);
    setPanelError(null);
    try {
      await update(id, { name: trimmed, color: editingColor });
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
        className="mb-3.5 flex flex-col gap-2.5 rounded-lg border border-border bg-card p-4"
      >
        <label htmlFor="newTagName" className="sr-only">
          Nome da tag
        </label>
        <Input
          id="newTagName"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Nome da tag"
          maxLength={40}
          required
          className="h-[34px] rounded-[9px] border-border bg-panel text-[13px]"
        />
        <ColorSwatchPicker value={newColor} onChange={setNewColor} />
        <Button
          type="submit"
          size="cta"
          className="w-full"
          disabled={creating || !newName.trim()}
        >
          {creating ? 'Adicionando…' : 'Adicionar'}
        </Button>
      </form>

      {panelError && <p className="mb-3.5 text-sm text-destructive">{panelError}</p>}

      {/*
        Onda 1 do redesign (2026-08-22) — antes, uma falha no carregamento
        INICIAL deixava `loading=false` e `tags=[]` ao mesmo tempo, então a
        tela mostrava o banner de erro (`loadError`, misturado com
        `panelError` acima) E "Nenhuma tag cadastrada ainda." juntos —
        contradição visual. Agora o carregamento inicial tem seu PRÓPRIO
        branch de erro (`ErrorState` com retry de verdade via
        `refresh()`), distinto do banner de ação (`panelError`, que
        continua só acima do formulário — erro de criar/editar/remover não é
        "não há conteúdo para mostrar").
      */}
      {loading ? (
        <div className="flex flex-col gap-0 overflow-hidden rounded-lg border border-border bg-card">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : loadError ? (
        <ErrorState description={loadError} onRetry={refresh} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {tags.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Nenhuma tag cadastrada ainda.</p>
          )}
          {tags.map((tag, index) => (
            <div
              key={tag.id}
              className={cn(
                'flex items-center gap-2.5 px-4 py-3',
                index < tags.length - 1 && 'border-b border-border/70',
              )}
              data-testid={`tag-row-${tag.id}`}
            >
              {editingId === tag.id ? (
                <div className="flex-1 space-y-2">
                  <Input
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    maxLength={40}
                    className="rounded-[9px]"
                  />
                  <ColorSwatchPicker value={editingColor} onChange={setEditingColor} />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={savingEdit || !editingName.trim()}
                      onClick={() => void handleSaveEdit(tag.id)}
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
                  <span
                    className={cn(
                      'inline-flex h-6 max-w-[10rem] items-center truncate rounded-[7px] px-[9px] text-[12.5px] font-medium',
                      tagBadgeClassName(tag.color),
                    )}
                  >
                    {tag.name}
                  </span>
                  <div className="flex-1" />
                  <button
                    type="button"
                    aria-label="Editar"
                    onClick={() => startEditing(tag.id, tag.name, tag.color)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Excluir"
                    onClick={() => void handleRemove(tag.id)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
