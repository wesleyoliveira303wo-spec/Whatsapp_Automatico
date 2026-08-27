import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { Percent, MessageSquareWarning, Repeat, MessageCircleReply } from 'lucide-react';
import {
  fetchAiPreferences,
  saveAiPreferences,
  ClientApiError,
  type AiAutonomyLevel,
  type AiPreferences,
} from '@/lib/clientApi';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/states/ErrorState';
import { cn } from '@/lib/utils';

const AUTONOMY_OPTIONS: Array<{ value: AiAutonomyLevel; label: string; description: string }> = [
  {
    value: 'conservative',
    label: 'Conservador',
    description: 'Confirma com um humano antes de fechar detalhes importantes.',
  },
  {
    value: 'balanced',
    label: 'Equilibrado',
    description: 'Conduz a conversa e fecha o que já está autorizado no Cérebro da IA.',
  },
  {
    value: 'autonomous',
    label: 'Autônomo',
    description: 'Conduz a negociação até o fim sozinho, quase sem encaminhar.',
  },
];

const DEFAULT_HANDOFF_MESSAGE_PLACEHOLDER =
  'Desculpe, não consegui responder a sua mensagem agora. Já estou encaminhando você para um de ' +
  'nossos atendentes, que vai continuar o seu atendimento em instantes. 🙏';

interface PreferencesForm {
  autonomyLevel: AiAutonomyLevel;
  maxDiscountPercent: string; // "" = sem limite configurado
  topicsToAvoid: string;
  escalateAfterAttempts: string; // "" = critério padrão
  customHandoffMessage: string; // "" = mensagem padrão
}

const EMPTY_FORM: PreferencesForm = {
  autonomyLevel: 'balanced',
  maxDiscountPercent: '',
  topicsToAvoid: '',
  escalateAfterAttempts: '',
  customHandoffMessage: '',
};

function preferencesToForm(preferences: AiPreferences | null): PreferencesForm {
  if (!preferences) return EMPTY_FORM;
  return {
    autonomyLevel: preferences.autonomyLevel,
    maxDiscountPercent:
      preferences.maxDiscountPercent != null ? String(preferences.maxDiscountPercent) : '',
    topicsToAvoid: preferences.topicsToAvoid ?? '',
    escalateAfterAttempts:
      preferences.escalateAfterAttempts != null ? String(preferences.escalateAfterAttempts) : '',
    customHandoffMessage: preferences.customHandoffMessage ?? '',
  };
}

function formsEqual(a: PreferencesForm, b: PreferencesForm): boolean {
  return (
    a.autonomyLevel === b.autonomyLevel &&
    a.maxDiscountPercent === b.maxDiscountPercent &&
    a.topicsToAvoid === b.topicsToAvoid &&
    a.escalateAfterAttempts === b.escalateAfterAttempts &&
    a.customHandoffMessage === b.customHandoffMessage
  );
}

function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 403)
      return 'Seu cargo não permite editar as preferências da IA (apenas administrador ou dono).';
    if (error.status === 401) return 'Sessão expirada. Entre novamente.';
    if (error.status === 400) return 'Valores inválidos — confira os limites de cada campo.';
  }
  return 'Não foi possível concluir a ação. Tente novamente.';
}

interface AiPreferencesPanelProps {
  sessionName: string;
}

/**
 * Painel de "Preferências" do Cérebro da IA (v3, Fase 3, 2026-08-26) —
 * controles REAIS de postura/limite operacional (decisão do fundador: nada
 * decorativo). Entidade própria (`AiPreferences`, GET/PUT), com seu próprio
 * ciclo de carregar/salvar — mesmo padrão de `AiFaqPanel` (aba
 * independente, sem participar do dirty-check de Conhecimento/Horário).
 */
export default function AiPreferencesPanel({ sessionName }: AiPreferencesPanelProps): JSX.Element {
  const [form, setForm] = useState<PreferencesForm>(EMPTY_FORM);
  const [savedForm, setSavedForm] = useState<PreferencesForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const { preferences } = await fetchAiPreferences(sessionName);
      const next = preferencesToForm(preferences);
      setForm(next);
      setSavedForm(next);
    } catch (error) {
      setLoadError(errorMessageFor(error));
    } finally {
      setLoading(false);
    }
  }, [sessionName]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = !formsEqual(form, savedForm);
  const discountOutOfRange =
    form.maxDiscountPercent !== '' &&
    (Number(form.maxDiscountPercent) < 0 || Number(form.maxDiscountPercent) > 100);
  const attemptsOutOfRange =
    form.escalateAfterAttempts !== '' &&
    (Number(form.escalateAfterAttempts) < 1 || Number(form.escalateAfterAttempts) > 20);
  const invalid = discountOutOfRange || attemptsOutOfRange;

  function updateField<K extends keyof PreferencesForm>(key: K, value: PreferencesForm[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSavedNotice(false);
  }

  async function handleSubmit(): Promise<void> {
    if (invalid) return;
    setSaving(true);
    setSaveError(null);
    setSavedNotice(false);
    try {
      const { preferences } = await saveAiPreferences(sessionName, {
        autonomyLevel: form.autonomyLevel,
        maxDiscountPercent: form.maxDiscountPercent === '' ? null : Number(form.maxDiscountPercent),
        topicsToAvoid: form.topicsToAvoid.trim() || null,
        escalateAfterAttempts:
          form.escalateAfterAttempts === '' ? null : Number(form.escalateAfterAttempts),
        customHandoffMessage: form.customHandoffMessage.trim() || null,
      });
      const next = preferencesToForm(preferences);
      setForm(next);
      setSavedForm(next);
      setSavedNotice(true);
    } catch (error) {
      setSaveError(errorMessageFor(error));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3.5">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
    );
  }

  if (loadError) {
    return <ErrorState description={loadError} onRetry={() => void load()} />;
  }

  return (
    // Redesign 2026-08-26 (bug real medido): este painel vive DENTRO do
    // `<form>` externo de `AiProfilePanel` (aba "Preferências") — um `<form>`
    // aninhado aqui é HTML inválido e, ao clicar "Salvar", o navegador
    // acabava disparando uma navegação de página inteira em vez do submit
    // esperado (perdendo a aba ativa e os dados não salvos). Corrigido
    // trocando `<form>`/`onSubmit` por `<div>`/botão comum com `onClick`.
    <div className="space-y-3.5">
      {/* Cabeçalho padronizado (2026-08-26): passou a ser desenhado por
          `TabSectionHeader`, montado em `AiProfilePanel.tsx` ANTES deste
          componente — removido daqui para não duplicar a marcação nas 5
          abas do Cérebro da IA. */}

      {/* Nível de autonomia */}
      <div className="rounded-lg border border-border bg-card p-[18px]">
        <p className="mb-2.5 text-[13px] font-semibold text-foreground">Nível de autonomia</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Nível de autonomia">
          {AUTONOMY_OPTIONS.map((option) => {
            const active = form.autonomyLevel === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => updateField('autonomyLevel', option.value)}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-left transition-colors',
                  active
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40 hover:bg-muted',
                )}
              >
                <span
                  className={cn(
                    'block text-[13px] font-medium',
                    active ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-[1.4] text-muted-foreground">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desconto máximo autônomo */}
      <div className="rounded-lg border border-border bg-card p-[18px]">
        <div className="mb-2.5 flex items-center gap-2">
          <Percent className="h-[15px] w-[15px] text-muted-foreground" aria-hidden="true" />
          <label htmlFor="ai-preferences-discount" className="text-[13px] font-semibold text-foreground">
            Desconto máximo autônomo
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Input
            id="ai-preferences-discount"
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            value={form.maxDiscountPercent}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              updateField('maxDiscountPercent', event.target.value)
            }
            placeholder="Sem limite configurado"
            className="h-9 w-32 text-[13px]"
          />
          <span className="text-[13px] text-muted-foreground">%</span>
        </div>
        {discountOutOfRange && (
          <p className="mt-1.5 text-xs text-destructive">Informe um valor entre 0 e 100.</p>
        )}
        <p className="mt-1.5 text-xs text-muted-foreground">
          Quanto a IA pode oferecer de desconto por conta própria, sem consultar um humano. Deixe em
          branco para a IA nunca oferecer desconto sozinha.
        </p>
      </div>

      {/* Assuntos a evitar */}
      <div className="rounded-lg border border-border bg-card p-[18px]">
        <div className="mb-2.5 flex items-center gap-2">
          <MessageSquareWarning className="h-[15px] w-[15px] text-muted-foreground" aria-hidden="true" />
          <label htmlFor="ai-preferences-topics" className="text-[13px] font-semibold text-foreground">
            Assuntos a evitar ou redirecionar
          </label>
        </div>
        <Textarea
          id="ai-preferences-topics"
          value={form.topicsToAvoid}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            updateField('topicsToAvoid', event.target.value)
          }
          rows={2}
          placeholder="Ex.: reclamações jurídicas, reembolso de pedidos antigos"
          className="rounded-[9px] border-border bg-panel text-[13px]"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          A IA evita entrar nesses assuntos e prefere encaminhar para um humano.
        </p>
      </div>

      {/* Escalar após N tentativas */}
      <div className="rounded-lg border border-border bg-card p-[18px]">
        <div className="mb-2.5 flex items-center gap-2">
          <Repeat className="h-[15px] w-[15px] text-muted-foreground" aria-hidden="true" />
          <label htmlFor="ai-preferences-attempts" className="text-[13px] font-semibold text-foreground">
            Escalar após N tentativas sem sucesso
          </label>
        </div>
        <Input
          id="ai-preferences-attempts"
          type="number"
          min={1}
          max={20}
          inputMode="numeric"
          value={form.escalateAfterAttempts}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            updateField('escalateAfterAttempts', event.target.value)
          }
          placeholder="Critério padrão"
          className="h-9 w-32 text-[13px]"
        />
        {attemptsOutOfRange && (
          <p className="mt-1.5 text-xs text-destructive">Informe um valor entre 1 e 20.</p>
        )}
        <p className="mt-1.5 text-xs text-muted-foreground">
          Deixe em branco para usar o critério padrão do sistema.
        </p>
      </div>

      {/* Mensagem de encaminhamento */}
      <div className="rounded-lg border border-border bg-card p-[18px]">
        <div className="mb-2.5 flex items-center gap-2">
          <MessageCircleReply className="h-[15px] w-[15px] text-muted-foreground" aria-hidden="true" />
          <label htmlFor="ai-preferences-handoff" className="text-[13px] font-semibold text-foreground">
            Mensagem de encaminhamento personalizada
          </label>
        </div>
        <Textarea
          id="ai-preferences-handoff"
          value={form.customHandoffMessage}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            updateField('customHandoffMessage', event.target.value)
          }
          rows={2}
          placeholder={DEFAULT_HANDOFF_MESSAGE_PLACEHOLDER}
          className="rounded-[9px] border-border bg-panel text-[13px]"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Enviada ao cliente quando a IA não consegue responder e escala para um atendente. Deixe em
          branco para usar a mensagem padrão do sistema.
        </p>
      </div>

      {saveError && (
        <p className="text-sm text-destructive" role="alert" aria-live="polite">
          {saveError}
        </p>
      )}
      {savedNotice && !dirty && (
        <p className="text-sm text-success" role="status" aria-live="polite">
          Salvo! As novas preferências já valem para a próxima resposta da IA.
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="cta"
          disabled={saving || invalid || !dirty}
          onClick={() => void handleSubmit()}
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
        {dirty && !saving && (
          <span className="text-xs text-muted-foreground">Há alterações não salvas.</span>
        )}
      </div>
    </div>
  );
}
