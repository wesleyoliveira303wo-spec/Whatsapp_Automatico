import { useState } from 'react';
import { X, Settings2, ChevronLeft } from 'lucide-react';
import TagChip from './TagChip';
import TagsPanel from './TagsPanel';
import { useTags } from '@/hooks/useTags';
import { assignConversationTag, unassignConversationTag, ClientApiError } from '@/lib/clientApi';
import { tagBadgeClassName } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { ConversationTagSummary } from '@/lib/clientApi';

interface ConversationTagPickerProps {
  sessionName: string;
  conversationId: string;
  tags: ConversationTagSummary[];
  onChange: (tags: ConversationTagSummary[]) => void;
}

/**
 * Seletor de tags de UMA conversa (Redesign 2026-08-05, R4) — vive no painel
 * de contexto (`ConversationContextPanel`). Lê o catálogo da sessão via
 * `useTags` (mesmo hook da gestão) só para saber QUAIS tags existem para
 * oferecer; a atribuição em si (`assignConversationTag`/`unassignConversationTag`)
 * é `message:send` (operator+, mesma régua de mover card no Pipeline) — sem
 * gate de papel aqui na UI, a barreira real é a API.
 *
 * Atualização otimista via `onChange` (o pai repassa para
 * `applyUpdate` de `useConversationDetail`) — evita esperar o próximo poll
 * de 4s para o chip aparecer/sumir.
 *
 * Redesign 2026-08-26 — a gestão do CATÁLOGO (`TagsPanel`, criar/editar/
 * remover tag) saiu da aba "Tags" de Configurações e passou a viver DENTRO
 * deste dropdown, atrás do botão "Cadastrar / gerenciar tags" (mesmo padrão
 * já aplicado a Respostas Rápidas em `MessageComposer.tsx`, 2026-08-25):
 * não fazia sentido gerenciar tags num lugar e atribuí-las em outro. Ao
 * voltar do modo gestão, `refreshCatalog()` releitura o catálogo — a
 * `TagsPanel` embutida tem sua PRÓPRIA instância de `useTags`, então uma
 * tag criada/renomeada/removida lá só aparece na lista de atribuição depois
 * desse refresh explícito.
 */
export default function ConversationTagPicker({
  sessionName,
  conversationId,
  tags,
  onChange,
}: ConversationTagPickerProps): JSX.Element {
  const { tags: catalog, loading: catalogLoading, refresh: refreshCatalog } = useTags(sessionName);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [managingTags, setManagingTags] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const assignedIds = new Set(tags.map((tag) => tag.id));
  const available = catalog.filter((tag) => !assignedIds.has(tag.id));

  async function handleAssign(
    tagId: string,
    name: string,
    color: ConversationTagSummary['color'],
  ): Promise<void> {
    setBusy(true);
    setErrorMessage(null);
    try {
      await assignConversationTag(conversationId, tagId);
      onChange([...tags, { id: tagId, name, color }]);
      setPickerOpen(false);
    } catch (error) {
      setErrorMessage(
        error instanceof ClientApiError && error.status === 403
          ? 'Seu cargo não permite atribuir tags.'
          : 'Falha ao atribuir a tag.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassign(tagId: string): Promise<void> {
    setBusy(true);
    setErrorMessage(null);
    try {
      await unassignConversationTag(conversationId, tagId);
      onChange(tags.filter((tag) => tag.id !== tagId));
    } catch {
      setErrorMessage('Falha ao remover a tag.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        Tags
      </p>
      <div className="relative flex flex-wrap items-center gap-[5px]">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className={cn(
              'inline-flex h-6 max-w-[8rem] items-center gap-[5px] rounded-[6px] pl-[9px] pr-[7px] text-xs font-medium',
              tagBadgeClassName(tag.color),
            )}
          >
            <span className="truncate">{tag.name}</span>
            <button
              type="button"
              aria-label={`Remover tag ${tag.name}`}
              disabled={busy}
              onClick={() => void handleUnassign(tag.id)}
              className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded text-current opacity-60 hover:bg-black/[.08] hover:opacity-100"
            >
              <X className="h-[9px] w-[9px]" aria-hidden="true" />
            </button>
          </span>
        ))}

        <button
          type="button"
          onClick={() => {
            setPickerOpen((open) => {
              const next = !open;
              if (!next) setManagingTags(false);
              return next;
            });
          }}
          className="h-6 whitespace-nowrap rounded-[6px] border border-dashed border-border px-[9px] text-xs font-medium text-muted-foreground hover:border-primary hover:bg-primary/[.06] hover:text-primary"
        >
          + Tag
        </button>

        {/*
          BUGFIX 2026-08-26 — os dois dropdowns eram ancorados ao pequeno
          `<div className="relative">` que envolvia só o BOTÃO "+ Tag". Como
          esse botão fica na PONTA ESQUERDA da linha (sem tag nenhuma
          atribuída ainda), um painel largo (a `TagsPanel` embutida, com
          formulário + 8 swatches de cor) esticava para a DIREITA e estourava
          a borda da coluna lateral (320px) — cortado pela borda da janela,
          sem scroll horizontal para alcançar o resto. Agora os dois
          dropdowns são ancorados ao `relative` da LINHA INTEIRA (`inset-x-0`,
          largura = 100% da coluna de Tags) — nunca mais largo que a área
          disponível, não importa onde o botão "+ Tag" esteja na linha.
        */}
        {pickerOpen && managingTags && (
          <div className="fx-scroll absolute inset-x-0 top-full z-10 mt-1.5 max-h-[420px] overflow-y-auto rounded-xl border border-border bg-card p-3 shadow-menu">
            <button
              type="button"
              onClick={() => {
                setManagingTags(false);
                refreshCatalog();
              }}
              className="mb-2.5 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Voltar
            </button>
            <p className="mb-2.5 text-[13px] font-semibold text-foreground">Gerenciar tags</p>
            <TagsPanel sessionName={sessionName} />
          </div>
        )}
        {pickerOpen && !managingTags && (
          <div className="absolute inset-x-0 top-full z-10 mt-1.5 rounded-xl border border-border bg-card p-1.5 shadow-menu">
            {catalogLoading && <p className="p-2 text-xs text-muted-foreground">Carregando…</p>}
            {!catalogLoading && available.length === 0 && (
              <p className="p-2 text-xs text-muted-foreground">Nenhuma tag disponível.</p>
            )}
            {available.map((tag) => (
              <button
                key={tag.id}
                type="button"
                disabled={busy}
                onClick={() => void handleAssign(tag.id, tag.name, tag.color)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <TagChip name={tag.name} color={tag.color} />
              </button>
            ))}
            <div className="mt-1 border-t border-border pt-1">
              <button
                type="button"
                onClick={() => setManagingTags(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-medium leading-snug text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Settings2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Cadastrar / gerenciar tags
              </button>
            </div>
          </div>
        )}
      </div>
      {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}
    </div>
  );
}
