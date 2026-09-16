import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  Search,
  Paperclip,
  X,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

import {
  ClientApiError,
  createGroupBroadcast,
  updateGroupBroadcast,
  attachGroupBroadcastStepMedia,
  fetchWhatsAppGroups,
  type WhatsAppGroupSummary,
  type GroupBroadcast,
  type GroupBroadcastStep,
  type GroupBroadcastTarget,
  type GroupBroadcastSummary,
  type GroupBroadcastMediaContentType,
} from '@/lib/clientApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';

interface GroupBroadcastCreateFormProps {
  sessionName: string;
  onCreated?: () => void;
  onClose?: () => void;
  /**
   * Modo edição (2026-09-15) — presente = a tela nasce preenchida com o
   * disparo já existente e o submit chama `updateGroupBroadcast` em vez de
   * `createGroupBroadcast`. Só `draft`/`paused` chegam aqui (a API recusa o
   * resto; quem decide se mostra o botão de editar é a tela de detalhe).
   */
  editing?: {
    broadcast: GroupBroadcast;
    steps: GroupBroadcastStep[];
    targets: GroupBroadcastTarget[];
  };
}

/** Teto do lado do CLIENTE — puramente UX (falha rápido); a API impõe o teto de verdade (413). Espelha `MAX_GROUP_MEDIA_BYTES.video` (o maior dos dois). */
const MAX_CLIENT_MEDIA_BYTES = 16 * 1024 * 1024;

/** Intervalos oferecidos na tela — o Domain aceita 1h a 24h; aqui só os saltos usuais. */
const RECURRENCE_HOUR_OPTIONS = [1, 2, 3, 4, 6, 8, 12, 24];

const MAX_GROUPS_PER_BROADCAST = 30;

/** Uma publicação por sequência (2026-09-14) — máximo 20, mesmo teto do backend (`MAX_STEPS_PER_BROADCAST`). */
const MAX_STEPS = 20;

let stepKeySeq = 0;
function nextStepKey(): string {
  stepKeySeq += 1;
  return `step-${stepKeySeq}`;
}

type StopMode = 'runs' | 'date' | 'manual';

interface StepDraft {
  key: string;
  /** Presente = etapa já existente (modo edição); ausente = etapa nova. */
  id?: string;
  /** Só em modo edição — quantas vezes esta etapa já publicou (2026-09-15). */
  runsCompleted?: number;
  /** Só em modo edição — a etapa já tem mídia anexada (não reenviada automaticamente ao salvar). */
  hadMedia: boolean;
  messageTemplate: string;
  mediaFile: File | null;
  recurring: boolean;
  intervalHours: number;
  stopMode: StopMode;
  maxRuns: number;
  endsAt: string;
}

function newStepDraft(): StepDraft {
  return {
    key: nextStepKey(),
    hadMedia: false,
    messageTemplate: '',
    mediaFile: null,
    recurring: false,
    intervalHours: 2,
    stopMode: 'runs',
    maxRuns: 5,
    endsAt: '',
  };
}

/** Modo edição (2026-09-15) — reconstrói o draft a partir de uma etapa já persistida. */
function stepDraftFromExisting(step: GroupBroadcastStep): StepDraft {
  return {
    key: nextStepKey(),
    id: step.id,
    runsCompleted: step.runsCompleted,
    hadMedia: Boolean(step.media),
    messageTemplate: step.messageTemplate,
    mediaFile: null,
    recurring: step.recurrenceIntervalHours !== undefined,
    intervalHours: step.recurrenceIntervalHours ?? 2,
    stopMode: step.recurrenceEndsAt ? 'date' : step.recurrenceMaxRuns !== undefined ? 'runs' : 'manual',
    maxRuns: step.recurrenceMaxRuns ?? 5,
    endsAt: step.recurrenceEndsAt ? step.recurrenceEndsAt.slice(0, 16) : '',
  };
}

/** Deriva a categoria do Domain a partir do `File.type` — mesmo padrão de `CampaignCreateForm.mediaContentTypeFor`, restrito a imagem/vídeo. */
function mediaContentTypeFor(file: File): GroupBroadcastMediaContentType {
  return file.type.startsWith('video/') ? 'video' : 'image';
}

function errorMessageFor(error: unknown, editing = false): string {
  if (error instanceof ClientApiError) {
    if (error.status === 403)
      return `Seu cargo não permite ${editing ? 'editar' : 'criar'} disparos em grupos.`;
    if (error.status === 401) return 'Sessão expirada — faça login novamente.';
    const code = (error.body as { error?: string } | undefined)?.error;
    if (code === 'whatsapp_not_connected')
      return 'Este WhatsApp não está conectado — conecte para ver os grupos.';
    if (code === 'groups_fetch_timeout')
      return 'O WhatsApp não respondeu à consulta de grupos a tempo. Tente de novo em instantes.';
    const message = (error.body as { message?: string } | undefined)?.message;
    if (message) return message;
  }
  return `Não foi possível ${editing ? 'salvar as alterações' : 'criar o disparo'}. Tente novamente.`;
}

function mediaErrorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    const code = (error.body as { error?: string } | undefined)?.error;
    if (code === 'group_broadcast_media_too_large') return 'Arquivo grande demais para anexar.';
    if (code === 'group_broadcast_media_type_mismatch')
      return 'O arquivo não parece ser do tipo selecionado.';
  }
  return 'Não foi possível anexar o arquivo.';
}

/**
 * Formulário de criação de disparo em grupos (2026-09-11), estendido em
 * 2026-09-14 para campanhas com múltiplas publicações em sequência
 * ("etapas") — segunda função de Campanhas: em vez de contatos individuais,
 * publica em grupos de WhatsApp dos quais o número desta sessão participa.
 *
 * Um disparo é uma sequência de 1 a {@link MAX_STEPS} publicações
 * ("Publicações") — cada uma com seu próprio texto, mídia opcional e
 * recorrência. Um disparo "simples" (uma mensagem só) é apenas uma
 * campanha com UMA publicação; não existe segundo conceito.
 *
 * O servidor confere cada grupo AO VIVO no momento da criação (nunca confia
 * no que esta tela sabe): um grupo pode ter deixado de existir, ou virado
 * "só administradores enviam" desde a última consulta — por isso a lista
 * carregada aqui pode divergir do resultado de `createGroupBroadcast` (que
 * mostra a tela seguinte, com o resultado REAL).
 *
 * **Este formulário só CRIA o disparo (sempre `draft`) e CALCULA quem
 * receberia — nunca envia mensagem nenhuma.** "Iniciar" pede confirmação
 * separada, na tela de lista/detalhe.
 */
export default function GroupBroadcastCreateForm({
  sessionName,
  onCreated,
  onClose,
  editing,
}: GroupBroadcastCreateFormProps): JSX.Element {
  const [name, setName] = useState(editing?.broadcast.name ?? '');

  const [groups, setGroups] = useState<WhatsAppGroupSummary[] | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Map<string, WhatsAppGroupSummary>>(
    () =>
      new Map(
        (editing?.targets ?? [])
          // Um grupo suprimido numa edição ANTERIOR por escolha explícita do
          // operador (`removed_by_operator`) não deve reaparecer pré-marcado
          // — ele foi removido de propósito; achado real (2026-09-16):
          // reabri-lo silenciosamente é diferente de um grupo indisponível
          // (que a seção "Indisponível" abaixo já trata à parte).
          .filter((target) => target.skipReason !== 'removed_by_operator')
          .map((target) => [
            target.groupJid,
            {
              jid: target.groupJid,
              name: target.groupName,
              participantCount: 0,
              announce: false,
              isAdmin: false,
              canSend: true,
            } satisfies WhatsAppGroupSummary,
          ]),
      ),
  );

  const [steps, setSteps] = useState<StepDraft[]>(() =>
    editing ? editing.steps.map(stepDraftFromExisting) : [newStepDraft()],
  );
  const [stepOffsetMinutes, setStepOffsetMinutes] = useState(
    editing?.broadcast.stepLaunchOffsetMinutes ?? 0,
  );

  const [windowEnabled, setWindowEnabled] = useState(
    Boolean(editing?.broadcast.sendWindowStart || editing?.broadcast.sendWindowEnd),
  );
  const [windowStart, setWindowStart] = useState(editing?.broadcast.sendWindowStart ?? '08:00');
  const [windowEnd, setWindowEnd] = useState(editing?.broadcast.sendWindowEnd ?? '20:00');

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mediaErrors, setMediaErrors] = useState<string[]>([]);
  const [result, setResult] = useState<{
    broadcastId: string;
    summary: GroupBroadcastSummary;
  } | null>(null);

  function loadGroups(refresh = false): void {
    setLoadingGroups(true);
    setGroupsError(null);
    fetchWhatsAppGroups(sessionName, { refresh })
      .then((page) => setGroups(page.groups))
      .catch((error) => setGroupsError(errorMessageFor(error)))
      .finally(() => setLoadingGroups(false));
  }

  useEffect(() => {
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem; "Atualizar" é uma ação explícita.
  }, [sessionName]);

  function toggleGroup(group: WhatsAppGroupSummary): void {
    if (!group.canSend) return;
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(group.jid)) {
        next.delete(group.jid);
      } else if (next.size < MAX_GROUPS_PER_BROADCAST) {
        next.set(group.jid, group);
      } else {
        toast({
          variant: 'destructive',
          title: 'Limite de grupos atingido',
          description: `No máximo ${MAX_GROUPS_PER_BROADCAST} grupos por disparo.`,
        });
      }
      return next;
    });
  }

  function updateStep(key: string, patch: Partial<StepDraft>): void {
    setSteps((current) => current.map((step) => (step.key === key ? { ...step, ...patch } : step)));
  }

  function addStep(): void {
    setSteps((current) => {
      if (current.length >= MAX_STEPS) {
        toast({
          variant: 'destructive',
          title: 'Limite de publicações atingido',
          description: `No máximo ${MAX_STEPS} publicações por disparo.`,
        });
        return current;
      }
      return [...current, newStepDraft()];
    });
  }

  function removeStep(key: string): void {
    setSteps((current) => (current.length <= 1 ? current : current.filter((step) => step.key !== key)));
  }

  function moveStep(key: string, direction: -1 | 1): void {
    setSteps((current) => {
      const index = current.findIndex((step) => step.key === key);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  function handleStepMediaSelected(key: string, event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_CLIENT_MEDIA_BYTES) {
      toast({
        variant: 'destructive',
        title: 'Arquivo grande demais',
        description: `O limite é de ${Math.round(MAX_CLIENT_MEDIA_BYTES / (1024 * 1024))}MB.`,
      });
      return;
    }
    updateStep(key, { mediaFile: file });
  }

  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!groups) return [];
    if (!term) return groups;
    return groups.filter((group) => group.name.toLowerCase().includes(term));
  }, [groups, search]);

  /**
   * Modo edição (2026-09-15) — um grupo já selecionado que não aparece mais
   * na listagem AO VIVO (saiu, ou o número foi removido) fica marcado como
   * "indisponível", NUNCA some sozinho da seleção — só um clique explícito
   * o remove.
   */
  const unavailableSelected = useMemo(() => {
    if (!groups) return [];
    const liveJids = new Set(groups.map((group) => group.jid));
    return Array.from(selected.values()).filter((group) => !liveJids.has(group.jid));
  }, [groups, selected]);

  function removeSelected(jid: string): void {
    setSelected((current) => {
      const next = new Map(current);
      next.delete(jid);
      return next;
    });
  }

  const stepsIncomplete = steps.some((step) => step.messageTemplate.trim().length === 0);
  const recurrenceIncomplete = steps.some(
    (step) => step.recurring && step.stopMode === 'date' && step.endsAt.trim().length === 0,
  );

  const canSubmit =
    name.trim().length > 0 && selected.size > 0 && steps.length > 0 && !stepsIncomplete;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit || submitting || recurrenceIncomplete) return;
    setSubmitting(true);
    setErrorMessage(null);
    setMediaErrors([]);
    try {
      const stepsPayload = steps.map((step) => ({
        ...(step.id ? { id: step.id } : {}),
        messageTemplate: step.messageTemplate.trim(),
        ...(step.recurring
          ? {
              recurrenceIntervalHours: step.intervalHours,
              ...(step.stopMode === 'runs' ? { recurrenceMaxRuns: step.maxRuns } : {}),
              ...(step.stopMode === 'date' && step.endsAt
                ? { recurrenceEndsAt: new Date(step.endsAt).toISOString() }
                : {}),
            }
          : {}),
      }));

      const envelope = {
        name: name.trim(),
        groupJids: Array.from(selected.keys()),
        ...(windowEnabled ? { sendWindowStart: windowStart, sendWindowEnd: windowEnd } : {}),
        ...(stepOffsetMinutes > 0 ? { stepLaunchOffsetMinutes: stepOffsetMinutes } : {}),
        steps: stepsPayload,
      };

      const response = editing
        ? await updateGroupBroadcast(editing.broadcast.id, envelope)
        : await createGroupBroadcast({ sessionName, ...envelope });

      // Casa cada rascunho local com a etapa correspondente na resposta —
      // por `id` para uma etapa já existente (edição); por ORDEM RELATIVA
      // entre as etapas NOVAS para as demais (o servidor sempre acrescenta
      // etapas novas ao final, na mesma ordem relativa em que apareceram no
      // payload — `order` de uma etapa já existente nunca é reatribuída,
      // então o índice puro do array local quebraria numa edição com etapas
      // intercaladas).
      const existingIds = new Set(steps.filter((step) => step.id).map((step) => step.id));
      const newResponseSteps = response.steps.filter((step) => !existingIds.has(step.id));
      let newStepCursor = 0;
      const failedUploads: string[] = [];
      for (let index = 0; index < steps.length; index += 1) {
        const draft = steps[index];
        const createdStep = draft.id
          ? response.steps.find((step) => step.id === draft.id)
          : newResponseSteps[newStepCursor++];
        if (!draft.mediaFile || !createdStep) continue;
        try {
          await attachGroupBroadcastStepMedia(
            response.broadcast.id,
            createdStep.id,
            draft.mediaFile,
            mediaContentTypeFor(draft.mediaFile),
          );
        } catch (mediaUploadError) {
          failedUploads.push(
            `Publicação ${index + 1}: ${mediaErrorMessageFor(mediaUploadError)}`,
          );
        }
      }
      setMediaErrors(failedUploads);

      setResult({ broadcastId: response.broadcast.id, summary: response.summary });
      onCreated?.();
    } catch (error) {
      setErrorMessage(errorMessageFor(error, Boolean(editing)));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <Card className="p-6">
        <h2 className="text-[16px] font-semibold text-foreground">
          {editing ? 'Alterações salvas' : 'Disparo criado'}
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {editing ? (
            <>
              A edição foi salva — <strong>nenhuma mensagem foi enviada</strong> por causa dela.
              Para publicar de verdade, use &quot;Iniciar envio&quot;/&quot;Retomar&quot; na tela de
              detalhe (que pede confirmação separada).
            </>
          ) : (
            <>
              O disparo foi calculado — <strong>nenhuma mensagem foi enviada ainda</strong>. Para
              publicar de verdade, abra o disparo e use &quot;Iniciar envio&quot; (que pede
              confirmação separada).
            </>
          )}
        </p>

        {mediaErrors.length > 0 && (
          <div className="mt-2 space-y-1">
            {mediaErrors.map((message) => (
              <p key={message} className="text-[12.5px] text-destructive">
                {editing ? 'A edição foi salva' : 'O disparo foi criado'}, mas um anexo falhou:{' '}
                {message} Você pode tentar de novo pela tela de detalhe.
              </p>
            ))}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3.5 py-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-[13px] text-foreground">
              {(() => {
                // `summary.pending` soma o progresso de TODAS as etapas em
                // paralelo (2026-09-14) — com N publicações, um mesmo grupo
                // conta N vezes. "Elegível" é sobre o GRUPO, não a etapa:
                // total - suprimidos, nunca `pending` cru.
                const eligible = result.summary.total - result.summary.skipped;
                return (
                  <>
                    <strong>{eligible}</strong> de <strong>{result.summary.total}</strong> grupo(s){' '}
                    {eligible === 1 ? 'está' : 'estão'} elegíve{eligible === 1 ? 'l' : 'is'} para
                    receber as publicações.
                  </>
                );
              })()}
            </p>
          </div>

          {result.summary.skipped > 0 && (
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3.5 py-3">
              <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-[13px] text-foreground">
                <strong>{result.summary.skipped}</strong> grupo(s) suprimido(s) — não existe(m) mais
                ou só administradores podem enviar lá.
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <Button asChild>
            <Link
              href={`/sessions/${encodeURIComponent(sessionName)}/campaigns/groups/${encodeURIComponent(result.broadcastId)}`}
            >
              Ver disparo
            </Link>
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold text-foreground">1. Informações</h2>
        <div className="mt-3 space-y-1.5">
          <label htmlFor="group-broadcast-name" className="text-sm font-medium text-foreground">
            Nome do disparo
          </label>
          <Input
            id="group-broadcast-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Aviso de promoção — grupos de clientes"
          />
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-foreground">
            2. Grupos{' '}
            {selected.size > 0 && (
              <span className="font-normal text-muted-foreground">
                ({selected.size} selecionado{selected.size === 1 ? '' : 's'})
              </span>
            )}
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingGroups}
            onClick={() => loadGroups(true)}
          >
            Atualizar lista
          </Button>
        </div>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          O servidor confere cada grupo de novo na hora de criar — um grupo que virou &quot;só
          administradores&quot; ou que você saiu entre agora e a criação será suprimido
          automaticamente.
        </p>

        {unavailableSelected.length > 0 && (
          <div className="mt-3 space-y-1.5 rounded-lg border border-warning/40 bg-warning/10 p-2.5">
            <p className="text-[12px] font-medium text-foreground">
              Selecionado(s) que não aparecem mais na lista ao vivo
            </p>
            {unavailableSelected.map((group) => (
              <div
                key={group.jid}
                className="flex items-center justify-between gap-2 rounded-md bg-card px-2.5 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                  {group.name}
                </span>
                <Badge variant="warning" className="shrink-0">
                  Indisponível
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remover ${group.name} da seleção`}
                  onClick={() => removeSelected(group.jid)}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {loadingGroups ? (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ) : groupsError ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3.5 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-[13px] text-foreground">{groupsError}</p>
          </div>
        ) : (
          <>
            <div className="relative mt-3">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar grupo por nome…"
                aria-label="Buscar grupo por nome"
                className="h-[34px] pl-8 text-[13px]"
              />
            </div>

            <div className="mt-2 max-h-[280px] overflow-y-auto rounded-lg border border-border">
              {filteredGroups.length === 0 ? (
                <p className="px-3 py-2.5 text-[12.5px] text-muted-foreground">
                  {groups && groups.length === 0
                    ? 'Este WhatsApp não participa de nenhum grupo.'
                    : 'Nenhum grupo encontrado.'}
                </p>
              ) : (
                filteredGroups.map((group) => (
                  <label
                    key={group.jid}
                    className={`flex items-center gap-2.5 border-b border-border/60 px-3 py-2 last:border-b-0 ${
                      group.canSend ? 'cursor-pointer hover:bg-muted/40' : 'cursor-not-allowed opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(group.jid)}
                      disabled={!group.canSend}
                      onChange={() => toggleGroup(group)}
                      aria-label={group.name}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                      {group.name}
                    </span>
                    <span className="shrink-0 text-[12px] text-muted-foreground">
                      {group.participantCount} participante{group.participantCount === 1 ? '' : 's'}
                    </span>
                    {group.announce && (
                      <Badge variant={group.canSend ? 'secondary' : 'warning'} className="shrink-0">
                        Só admins
                      </Badge>
                    )}
                  </label>
                ))
              )}
            </div>
          </>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-foreground">
            3. Publicações{' '}
            <span className="font-normal text-muted-foreground">
              ({steps.length} de {MAX_STEPS})
            </span>
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={addStep} disabled={steps.length >= MAX_STEPS}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Adicionar publicação
          </Button>
        </div>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Cada publicação tem sua própria mensagem, anexo e repetição — todas rodam em paralelo,
          cada uma no seu próprio ritmo, desde o início.
        </p>

        <div className="mt-3 space-y-1.5 rounded-lg border border-border bg-muted/30 px-3.5 py-3">
          <label htmlFor="step-offset-minutes" className="text-sm font-medium text-foreground">
            Cadência entre publicações
          </label>
          <p className="text-[12px] text-muted-foreground">
            {steps.length > 1
              ? 'Espera entre o início de uma publicação e o início da seguinte, só na primeira vez (depois, cada uma repete sozinha). Zero = todas começam juntas.'
              : 'Só faz efeito com 2 ou mais publicações — adicione outra abaixo para usar.'}
          </p>
          <div className="flex items-center gap-2">
            <Input
              id="step-offset-minutes"
              type="number"
              min={0}
              max={360}
              value={stepOffsetMinutes}
              disabled={steps.length <= 1}
              onChange={(event) => setStepOffsetMinutes(Math.max(0, Number(event.target.value)))}
              className="w-24"
            />
            <span className="text-[13px] text-muted-foreground">minuto(s)</span>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {steps.map((step, index) => (
            <div key={step.key} className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                  Publicação {index + 1}
                  {Boolean(step.runsCompleted) && (
                    <Badge variant="secondary" className="font-normal">
                      publicou {step.runsCompleted}x
                    </Badge>
                  )}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Mover publicação ${index + 1} para cima`}
                    disabled={index === 0}
                    onClick={() => moveStep(step.key, -1)}
                  >
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Mover publicação ${index + 1} para baixo`}
                    disabled={index === steps.length - 1}
                    onClick={() => moveStep(step.key, 1)}
                  >
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remover publicação ${index + 1}`}
                    disabled={steps.length <= 1}
                    onClick={() => removeStep(step.key)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 space-y-1.5">
                <label htmlFor={`step-message-${step.key}`} className="text-sm font-medium text-foreground">
                  Mensagem
                </label>
                <Textarea
                  id={`step-message-${step.key}`}
                  value={step.messageTemplate}
                  onChange={(event) => updateStep(step.key, { messageTemplate: event.target.value })}
                  placeholder="Ex.: Olá, pessoal! Temos uma novidade para vocês."
                  rows={3}
                />
              </div>

              <div className="mt-3">
                <p className="text-[13px] font-medium text-foreground">
                  Anexo <span className="text-muted-foreground">(opcional — imagem ou vídeo)</span>
                </p>
                {step.hadMedia && !step.mediaFile && (
                  <p className="mt-1.5 text-[12px] text-muted-foreground">
                    Já tem um arquivo anexado — anexar outro aqui o substitui.
                  </p>
                )}
                <StepMediaInput
                  stepKey={step.key}
                  file={step.mediaFile}
                  onSelect={handleStepMediaSelected}
                  onClear={() => updateStep(step.key, { mediaFile: null })}
                />
              </div>

              <div className="mt-4 border-t border-border pt-3">
                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={step.recurring}
                    onChange={(event) => updateStep(step.key, { recurring: event.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-border"
                  />
                  <span className="text-[13px]">
                    <span className="font-medium text-foreground">Repetir esta publicação</span>
                    <span className="mt-0.5 block text-muted-foreground">
                      Publica de novo nos mesmos grupos de tempos em tempos, antes de avançar para a
                      próxima. Publicar demais no mesmo grupo é o que mais gera denúncia.
                    </span>
                  </span>
                </label>

                {step.recurring && (
                  <div className="mt-3 space-y-3 pl-6">
                    <div className="space-y-1.5">
                      <label
                        htmlFor={`step-interval-${step.key}`}
                        className="text-sm font-medium text-foreground"
                      >
                        Repetir a cada
                      </label>
                      <select
                        id={`step-interval-${step.key}`}
                        value={step.intervalHours}
                        onChange={(event) =>
                          updateStep(step.key, { intervalHours: Number(event.target.value) })
                        }
                        className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
                      >
                        {RECURRENCE_HOUR_OPTIONS.map((hours) => (
                          <option key={hours} value={hours}>
                            {hours === 1 ? '1 hora' : hours + ' horas'}
                          </option>
                        ))}
                      </select>
                    </div>

                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium text-foreground">Até quando</legend>
                      <label className="flex items-center gap-2 text-[13px] text-foreground">
                        <input
                          type="radio"
                          name={`step-stop-mode-${step.key}`}
                          checked={step.stopMode === 'runs'}
                          onChange={() => updateStep(step.key, { stopMode: 'runs' })}
                          className="h-4 w-4"
                        />
                        Um número de repetições
                      </label>
                      {step.stopMode === 'runs' && (
                        <Input
                          type="number"
                          min={2}
                          max={100}
                          value={step.maxRuns}
                          onChange={(event) =>
                            updateStep(step.key, { maxRuns: Number(event.target.value) })
                          }
                          aria-label="Quantas repetições"
                          className="ml-6 w-28"
                        />
                      )}

                      <label className="flex items-center gap-2 text-[13px] text-foreground">
                        <input
                          type="radio"
                          name={`step-stop-mode-${step.key}`}
                          checked={step.stopMode === 'date'}
                          onChange={() => updateStep(step.key, { stopMode: 'date' })}
                          className="h-4 w-4"
                        />
                        Uma data e hora de término
                      </label>
                      {step.stopMode === 'date' && (
                        <Input
                          type="datetime-local"
                          value={step.endsAt}
                          onChange={(event) => updateStep(step.key, { endsAt: event.target.value })}
                          aria-label="Data e hora de término"
                          className="ml-6 w-64 bg-card [color-scheme:light] dark:[color-scheme:dark]"
                        />
                      )}

                      <label className="flex items-center gap-2 text-[13px] text-foreground">
                        <input
                          type="radio"
                          name={`step-stop-mode-${step.key}`}
                          checked={step.stopMode === 'manual'}
                          onChange={() => updateStep(step.key, { stopMode: 'manual' })}
                          className="h-4 w-4"
                        />
                        Até eu cancelar
                      </label>
                      {step.stopMode === 'manual' && (
                        <p className="ml-6 flex items-start gap-1.5 text-[12px] text-muted-foreground">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          Sem prazo para acabar: continua repetindo esta publicação até você pausar ou
                          cancelar o disparo inteiro.
                        </p>
                      )}
                    </fieldset>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-[15px] font-semibold text-foreground">4. Horário permitido</h2>
        <label className="mt-3 flex items-center gap-2 text-[13px] text-foreground">
          <input
            type="checkbox"
            checked={windowEnabled}
            onChange={(event) => setWindowEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Só publicar dentro de um horário
        </label>
        {windowEnabled && (
          <div className="ml-6 mt-2 flex items-center gap-2">
            <Input
              type="time"
              value={windowStart}
              onChange={(event) => setWindowStart(event.target.value)}
              aria-label="Início do horário permitido"
              className="w-28 bg-card [color-scheme:light] dark:[color-scheme:dark]"
            />
            <span className="text-[13px] text-muted-foreground">até</span>
            <Input
              type="time"
              value={windowEnd}
              onChange={(event) => setWindowEnd(event.target.value)}
              aria-label="Fim do horário permitido"
              className="w-28 bg-card [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>
        )}
        <p className="ml-6 mt-2 text-[12px] text-muted-foreground">
          Vale para a campanha inteira, atravessando publicações. Uma publicação ou repetição que
          cairia fora desse horário espera até a próxima janela — nunca é descartada.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="text-[15px] font-semibold text-foreground">5. Revisão</h2>
        <dl className="mt-3 space-y-1.5 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Nome</dt>
            <dd className="text-right font-medium text-foreground">{name || '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Grupos selecionados</dt>
            <dd className="text-right font-medium text-foreground">{selected.size}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Publicações</dt>
            <dd className="text-right text-foreground">{steps.length}</dd>
          </div>
        </dl>
        <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2.5 text-[12px] leading-[1.5] text-muted-foreground">
          Publicar em grupo é o padrão que o WhatsApp mais associa a spam — o ritmo entre grupos é
          espaçado (dezenas de segundos) e um disparo pausa sozinho ao primeiro sinal de falhas
          seguidas. Ao confirmar aqui, o disparo é só CRIADO (como rascunho, sem publicar nada); você
          ainda precisará abrir o disparo e confirmar &quot;Iniciar envio&quot; separadamente.
        </p>
        {stepsIncomplete && (
          <p className="mt-2 text-[12.5px] text-destructive">
            Toda publicação precisa de uma mensagem antes de criar o disparo.
          </p>
        )}
        {errorMessage && <p className="mt-2 text-[12.5px] text-destructive">{errorMessage}</p>}
        <div className="mt-4 flex items-center gap-2">
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || submitting}>
            {editing
              ? submitting
                ? 'Salvando…'
                : 'Salvar alterações'
              : submitting
                ? 'Criando…'
                : 'Criar disparo (rascunho)'}
          </Button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-[12.5px] text-muted-foreground underline"
            >
              Cancelar
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Anexo de mídia de uma etapa — extraído para reduzir o corpo de `map()` acima. */
function StepMediaInput({
  stepKey,
  file,
  onSelect,
  onClear,
}: {
  stepKey: string;
  file: File | null;
  onSelect: (stepKey: string, event: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(event) => onSelect(stepKey, event)}
      />
      {file ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-foreground">{file.name}</p>
              <p className="text-[12px] text-muted-foreground">
                {mediaContentTypeFor(file)} · {Math.round(file.size / 1024)}KB
              </p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Anexar arquivo
        </Button>
      )}
    </>
  );
}
