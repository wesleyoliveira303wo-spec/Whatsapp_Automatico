import { useCallback, useEffect, useState, type FormEvent, type ChangeEvent } from 'react';
import {
  fetchAiProfile,
  saveAiProfile,
  ClientApiError,
  type AiBusinessProfile,
} from '@/lib/clientApi';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import AiProfileQuizWizard from '@/components/AiProfileQuizWizard';
import AiProfileFaqDialog from '@/components/AiProfileFaqDialog';
import { appendFaqEntry, appendToProfileContent } from '@/lib/aiProfileFaq';

/**
 * Teto de caracteres — espelha `MAX_PROFILE_CONTENT_LENGTH` da API
 * (`AiBusinessProfileService`). Duplicado aqui de propósito (a UI não importa
 * código do backend), só para dar feedback de contador/erro antes de enviar; a
 * validação REAL é sempre a da API.
 */
const MAX_CONTENT_LENGTH = 20_000;

/** Texto-guia mostrado no textarea vazio — ajuda o dono do negócio a saber o que escrever. */
const PLACEHOLDER = [
  'Descreva sua empresa para a IA responder os clientes. Por exemplo:',
  '',
  '- Nome: Salão da Maria',
  '- O que fazemos: cortes, escova, coloração e manicure',
  '- Preços: corte R$ 50, escova R$ 40, coloração a partir de R$ 120',
  '- Horário: terça a sábado, das 9h às 18h',
  '- Endereço: Rua das Flores, 123',
  '- Formas de pagamento: dinheiro, Pix e cartão',
  '- Observações: agendamento só por WhatsApp; não atendemos aos domingos',
].join('\n');

/** Fuso horários oferecidos — os mais relevantes para negócios brasileiros + UTC. */
const TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'São Paulo / Brasília (UTC−3)' },
  { value: 'America/Fortaleza', label: 'Fortaleza / Recife (UTC−3, sem horário de verão)' },
  { value: 'America/Bahia', label: 'Salvador (UTC−3)' },
  { value: 'America/Manaus', label: 'Manaus (UTC−4)' },
  { value: 'America/Boa_Vista', label: 'Boa Vista (UTC−4)' },
  { value: 'America/Porto_Velho', label: 'Porto Velho (UTC−4)' },
  { value: 'America/Rio_Branco', label: 'Acre (UTC−5)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (UTC−2)' },
  { value: 'UTC', label: 'UTC' },
];

/** Dias da semana (bit0=Dom … bit6=Sáb) — mesmo esquema de `workingHours.ts` na API. */
const DAYS = [
  { label: 'Dom', bit: 0 },
  { label: 'Seg', bit: 1 },
  { label: 'Ter', bit: 2 },
  { label: 'Qua', bit: 3 },
  { label: 'Qui', bit: 4 },
  { label: 'Sex', bit: 5 },
  { label: 'Sáb', bit: 6 },
];

/** Mensagem padrão usada pela API quando `offHoursMessage` está vazio — exibida como placeholder. */
const DEFAULT_OFF_HOURS_MESSAGE_PLACEHOLDER =
  'Olá! Recebemos sua mensagem, mas estamos fora do horário de atendimento. ' +
  'Assim que abrirmos, um atendente ou a nossa IA irão te responder. Até logo!';

/**
 * Estado local do formulário de horário de atendimento (F1.8).
 * Separado do `content` para facilitar comparação de "sujo" e
 * para isolar o bloco visual.
 */
interface OffHoursForm {
  enabled: boolean;
  message: string;
  start: string; // "HH:MM" ou "" (não configurado)
  end: string; // "HH:MM" ou "" (não configurado)
  days: number; // bitmask
  timezone: string; // IANA
}

function profileToOffHoursForm(profile: AiBusinessProfile | null): OffHoursForm {
  return {
    enabled: profile?.offHoursEnabled ?? false,
    message: profile?.offHoursMessage ?? '',
    start: profile?.workingHoursStart ?? '',
    end: profile?.workingHoursEnd ?? '',
    days: profile?.workingDays ?? 62, // Mon–Fri default
    timezone: profile?.timezone ?? 'America/Sao_Paulo',
  };
}

function offHoursFormsEqual(a: OffHoursForm, b: OffHoursForm): boolean {
  return (
    a.enabled === b.enabled &&
    a.message === b.message &&
    a.start === b.start &&
    a.end === b.end &&
    a.days === b.days &&
    a.timezone === b.timezone
  );
}

function errorMessageFor(error: unknown): string {
  if (error instanceof ClientApiError) {
    const code = (error.body as { error?: string } | undefined)?.error;
    if (code === 'validation_error')
      return `O texto não pode passar de ${MAX_CONTENT_LENGTH.toLocaleString('pt-BR')} caracteres.`;
    if (code === 'tenant_not_found') return 'Empresa não encontrada.';
    if (error.status === 403)
      return 'Seu cargo não permite editar o Cérebro da IA (apenas administrador ou dono).';
    if (error.status === 401) return 'Sessão expirada. Entre novamente.';
  }
  return 'Não foi possível concluir a ação. Tente novamente.';
}

interface AiProfilePanelProps {
  /**
   * Nome da sessão de WhatsApp cujo perfil está sendo editado — o "Cérebro da
   * IA" migrou de 1:1 por tenant para 1:1 por sessão (M6H-3, 2026-07-25).
   * Cada WhatsApp pode ter seu próprio contexto de negócio.
   */
  sessionName: string;
}

type ProfileMode = 'guided' | 'freeform';

/**
 * Painel do "Cérebro da IA" (Base de Conhecimento, Nível 1 + v2 "Assistente
 * Guiado", ADR #71/#85/#87) + Horário de atendimento (F1.8, 2026-08-01).
 *
 * Duas abas para o CONTEÚDO: "Assistente Guiado" (quiz passo a passo) e
 * "Texto livre" (textarea original). Abaixo das abas, sempre visível: seção
 * "Horário de atendimento" com toggle, dias, horários, fuso e mensagem
 * personalizada. Um único botão Salvar persiste TODOS os campos juntos num
 * PUT só.
 *
 * Regra de ADIÇÃO, nunca substituição (ADR #87): tanto o quiz quanto o FAQ
 * sempre ANEXAM ao conteúdo existente — nunca sobrescrevem.
 *
 * F1.8: `saveAiProfile` recebe `SaveAiProfileData` (antes só `content`
 * string). A dirty-check inclui tanto o `content` quanto os 6 campos de
 * horário — qualquer mudança em qualquer campo habilita o Salvar.
 */
export default function AiProfilePanel({ sessionName }: AiProfilePanelProps): JSX.Element {
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [mode, setMode] = useState<ProfileMode>('freeform');
  const [justAddedFromQuiz, setJustAddedFromQuiz] = useState(false);

  // F1.8 — estado do horário de atendimento
  const [offHours, setOffHours] = useState<OffHoursForm>(profileToOffHoursForm(null));
  const [savedOffHours, setSavedOffHours] = useState<OffHoursForm>(profileToOffHoursForm(null));

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    setMode('freeform');
    setJustAddedFromQuiz(false);
    try {
      const { profile } = await fetchAiProfile(sessionName);
      const c = profile?.content ?? '';
      const oh = profileToOffHoursForm(profile);
      setContent(c);
      setSavedContent(c);
      setUpdatedAt(profile?.updatedAt ?? null);
      setOffHours(oh);
      setSavedOffHours(oh);
    } catch (error) {
      setLoadError(errorMessageFor(error));
    } finally {
      setLoading(false);
    }
  }, [sessionName]);

  useEffect(() => {
    void load();
  }, [load]);

  const tooLong = content.length > MAX_CONTENT_LENGTH;
  const dirty = content !== savedContent || !offHoursFormsEqual(offHours, savedOffHours);

  // Validação leve de horário: avisa se fim <= início mas não bloqueia o save
  const invalidHours =
    offHours.enabled &&
    offHours.start !== '' &&
    offHours.end !== '' &&
    offHours.end <= offHours.start;

  const handleSubmit = useCallback(
    async (event: FormEvent): Promise<void> => {
      event.preventDefault();
      setSaving(true);
      setSaveError(null);
      setSavedNotice(false);
      try {
        const { profile } = await saveAiProfile(sessionName, {
          content,
          offHoursEnabled: offHours.enabled,
          offHoursMessage: offHours.message.trim() || null,
          workingHoursStart: offHours.start || null,
          workingHoursEnd: offHours.end || null,
          workingDays: offHours.days,
          timezone: offHours.timezone,
        });
        const c = profile.content;
        const oh = profileToOffHoursForm(profile);
        setContent(c);
        setSavedContent(c);
        setUpdatedAt(profile.updatedAt);
        setOffHours(oh);
        setSavedOffHours(oh);
        setSavedNotice(true);
      } catch (error) {
        setSaveError(errorMessageFor(error));
      } finally {
        setSaving(false);
      }
    },
    [content, offHours, sessionName],
  );

  const toggleDay = useCallback((bit: number): void => {
    setOffHours((prev) => ({ ...prev, days: prev.days ^ (1 << bit) }));
    setSavedNotice(false);
  }, []);

  const updateOffHours = useCallback(
    <K extends keyof OffHoursForm>(key: K, value: OffHoursForm[K]): void => {
      setOffHours((prev) => ({ ...prev, [key]: value }));
      setSavedNotice(false);
    },
    [],
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Modo: Assistente Guiado / Texto livre — pílula CLARA (fica dentro de uma tela já clara), distinta da pílula ESCURA das abas "Cérebro da IA"/"Respostas Rápidas" um nível acima (ai.tsx). */}
      <div
        className="mb-4 flex w-fit gap-1 rounded-[10px] border border-border bg-panel p-[3px]"
        role="tablist"
        aria-label="Modo de edição do Cérebro da IA"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'guided'}
          onClick={() => setMode('guided')}
          className={cn(
            'h-[27px] rounded-[7px] px-3 text-[12.5px] font-medium transition-colors',
            mode === 'guided'
              ? 'bg-card text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Assistente Guiado
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'freeform'}
          onClick={() => setMode('freeform')}
          className={cn(
            'h-[27px] rounded-[7px] px-3 text-[12.5px] font-medium transition-colors',
            mode === 'freeform'
              ? 'bg-card text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Texto livre
        </button>
      </div>

      {/* Conteúdo da aba: Assistente Guiado */}
      {mode === 'guided' && (
        <div className="mb-4">
          <AiProfileQuizWizard
            onGenerate={(text) => {
              setContent((current) => appendToProfileContent(current, text));
              setJustAddedFromQuiz(true);
              setSavedNotice(false);
              setMode('freeform');
            }}
          />
        </div>
      )}

      {/* Conteúdo da aba: Texto livre */}
      {mode === 'freeform' && (
        <div className="mb-4 rounded-lg border border-border bg-card p-[18px]">
          {justAddedFromQuiz && (
            <p className="mb-3 rounded-md bg-primary/5 px-3 py-2 text-xs text-primary">
              As respostas do Assistente Guiado foram adicionadas ao final do texto abaixo. Revise e
              clique em Salvar.
            </p>
          )}

          <Textarea
            value={content}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
              setContent(event.target.value);
              setSavedNotice(false);
              setJustAddedFromQuiz(false);
            }}
            placeholder={PLACEHOLDER}
            rows={10}
            className="resize-y border-0 bg-transparent p-0 text-[13.5px] leading-[1.6] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />

          <div className="mt-2.5 flex items-center justify-between border-t border-border/70 pt-3">
            <span
              className={cn(
                'text-[11.5px] tabular-nums',
                tooLong ? 'text-destructive' : 'text-muted-foreground',
              )}
              title={
                updatedAt
                  ? `Última atualização: ${new Date(updatedAt).toLocaleString('pt-BR')}`
                  : undefined
              }
            >
              {content.length.toLocaleString('pt-BR')} /{' '}
              {MAX_CONTENT_LENGTH.toLocaleString('pt-BR')} caracteres
            </span>
            <Button type="submit" size="cta" disabled={saving || tooLong || !dirty}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </div>
      )}

      {/* "Cadastrar pergunta não respondida" — só na aba Texto livre (fluxo próprio do quiz não se mistura com FAQ manual, ver docstring do componente). */}
      {mode === 'freeform' && (
        <div className="mb-5">
          <AiProfileFaqDialog
            onConfirm={(question, answer) => {
              setContent((current) => appendFaqEntry(current, question, answer));
              setJustAddedFromQuiz(false);
              setSavedNotice(false);
            }}
          />
        </div>
      )}

      {/* ── Horário de atendimento (F1.8) ─────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-[18px]">
        <div className="mb-3.5 flex items-center justify-between">
          <span className="text-[13.5px] font-semibold text-foreground">
            Horário de atendimento
          </span>
          <Switch
            checked={offHours.enabled}
            onCheckedChange={(checked) => updateOffHours('enabled', checked)}
            aria-label="Enviar aviso automático quando a mensagem chegar fora do horário"
          />
        </div>

        {offHours.enabled && (
          <div>
            {/* Dias da semana */}
            <div
              className="mb-3.5 flex flex-wrap gap-[5px]"
              role="group"
              aria-label="Dias de atendimento"
            >
              {DAYS.map(({ label, bit }) => {
                const active = (offHours.days & (1 << bit)) !== 0;
                return (
                  <button
                    key={bit}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleDay(bit)}
                    className={cn(
                      'h-[30px] w-[34px] rounded-lg text-xs font-semibold transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {offHours.days === 0 && (
              <p className="-mt-2.5 mb-3.5 text-xs text-warning">
                Nenhum dia selecionado — o aviso será enviado sempre.
              </p>
            )}

            {/* Horário de início/fim + fuso — texto corrido "Das X às Y" (igual
                ao mockup); os dois campos de hora mantêm nomes acessíveis
                DISTINTOS via `aria-label` ("Das"/"Até"), já que não fazem mais
                parte de dois `<label>` próprios separados. */}
            <div className="mb-3.5 flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                Das
                <input
                  id="ai-profile-hours-start"
                  aria-label="Das"
                  type="time"
                  value={offHours.start}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    updateOffHours('start', e.target.value)
                  }
                  className="rounded-[7px] border border-border px-[7px] py-1 text-[12.5px] text-foreground"
                />
                às
                <input
                  id="ai-profile-hours-end"
                  aria-label="Até"
                  type="time"
                  value={offHours.end}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    updateOffHours('end', e.target.value)
                  }
                  className="rounded-[7px] border border-border px-[7px] py-1 text-[12.5px] text-foreground"
                />
              </span>
              <select
                id="ai-profile-timezone"
                aria-label="Fuso horário"
                value={offHours.timezone}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  updateOffHours('timezone', e.target.value)
                }
                className="rounded-[7px] border border-border bg-card px-2 py-[5px] text-[12.5px] text-foreground"
              >
                {TIMEZONES.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {invalidHours && (
              <p className="-mt-2.5 mb-3.5 text-xs text-warning">
                O horário de fim é anterior ou igual ao de início — o aviso será enviado sempre.
              </p>
            )}

            {/* Mensagem fora do expediente */}
            <label
              htmlFor="ai-profile-off-hours-msg"
              className="mb-1.5 block text-xs text-muted-foreground"
            >
              Mensagem fora do expediente
            </label>
            <Textarea
              id="ai-profile-off-hours-msg"
              value={offHours.message}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                updateOffHours('message', e.target.value)
              }
              placeholder={DEFAULT_OFF_HOURS_MESSAGE_PLACEHOLDER}
              rows={2}
              className="rounded-[9px] border-border bg-panel text-[13px] leading-[1.5]"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Deixe em branco para usar a mensagem padrão. A IA ainda vai responder — este aviso é
              incluído no contexto, não no lugar da resposta.
            </p>
          </div>
        )}
      </div>
      {/* ── Fim da seção de horário ────────────────────────────────────────── */}

      {/* Feedback + botão de salvar "de reserva" — só quando o modo Texto
          livre (com seu próprio Salvar embutido no card) NÃO está na tela,
          senão haveria dois botões "Salvar" idênticos visíveis ao mesmo
          tempo. É o único jeito de salvar uma mudança de Horário de
          atendimento sem trocar para a aba Texto livre. */}
      {saveError && <p className="mt-3 text-sm text-destructive">{saveError}</p>}
      {savedNotice && !dirty && (
        <p className="mt-3 text-sm text-success">
          Salvo! A IA já vai usar essas informações nas próximas respostas.
        </p>
      )}
      {mode !== 'freeform' && (
        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" size="cta" disabled={saving || tooLong || !dirty}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
          {dirty && !saving && (
            <span className="text-xs text-muted-foreground">Há alterações não salvas.</span>
          )}
        </div>
      )}
    </form>
  );
}
