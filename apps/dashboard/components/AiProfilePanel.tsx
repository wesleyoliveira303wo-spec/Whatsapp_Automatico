import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  HelpCircle,
  Clock,
  AlignLeft,
  MessagesSquare,
  LayoutDashboard,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import {
  fetchAiProfile,
  saveAiProfile,
  ClientApiError,
  type AiBusinessProfile,
} from '@/lib/clientApi';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { TabList, TabTrigger } from '@/components/ui/tabs-nav';
import AnimatedNumber from '@/components/ui/animated-number';
import ErrorState from '@/components/states/ErrorState';
import { cn } from '@/lib/utils';
import { fadeInUp, staggerContainer } from '@/lib/motion';
import AiProfileQuizWizard from '@/components/AiProfileQuizWizard';
import AiFaqPanel from '@/components/AiFaqPanel';
import AiPreferencesPanel from '@/components/AiPreferencesPanel';
import { appendToProfileContent } from '@/lib/aiProfileFaq';
import { useAiFaqEntries } from '@/hooks/useAiFaqEntries';

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

interface OverviewStatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  numericValue?: number;
  tone: 'primary' | 'success' | 'warning' | 'muted';
}

/**
 * Redesign 2026-08-25 (pedido do fundador: "está genérico, quero cara de
 * app profissional") — mesmo padrão de `StatCard` já usado em
 * `ContactsPanel`/`CampaignsPanel` (ícone num círculo colorido + rótulo +
 * valor grande), reimplementado localmente aqui: cada tela já tem sua
 * PRÓPRIA variação (layout horizontal vs. vertical, com/sem badge de
 * tendência) — mesmo racional de duplicação deliberada já estabelecido no
 * projeto, em vez de forçar um componente genérico único cedo demais.
 * Substitui a lista `<dl>` plana que existia antes (texto sozinho, sem
 * nenhum ícone/cor — a causa raiz do visual "genérico").
 */
const OVERVIEW_TONE_CLASSES: Record<OverviewStatCardProps['tone'], string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  muted: 'bg-muted text-muted-foreground',
};

function OverviewStatCard({
  icon: Icon,
  label,
  value,
  numericValue,
  tone,
}: OverviewStatCardProps): JSX.Element {
  return (
    <motion.div
      variants={fadeInUp}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
    >
      <div
        className={cn(
          'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
          OVERVIEW_TONE_CLASSES[tone],
        )}
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[12px] text-muted-foreground">{label}</p>
        <p className="truncate text-[16px] font-semibold leading-tight tabular-nums text-foreground">
          {numericValue !== undefined ? <AnimatedNumber value={numericValue} /> : value}
        </p>
      </div>
    </motion.div>
  );
}

interface TabSectionHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Conteúdo opcional alinhado à direita (ex.: "Atualizado em ..." na Visão geral). */
  trailing?: ReactNode;
}

/**
 * Cabeçalho PADRONIZADO das 5 abas do Cérebro da IA (pedido do fundador,
 * 2026-08-26: "quero que todas as 5 abas tenham o mesmo cabeçario... hoje
 * elas não são nada padronizadas"). Antes, cada aba tinha seu próprio
 * cabeçalho ad-hoc — Conhecimento/Assistente Guiado já usavam este padrão
 * (ícone num círculo + título + descrição), mas Visão geral não tinha
 * NENHUM cabeçalho equivalente (só um `<h2>` solto), FAQ não tinha nenhum a
 * nível de aba (só o mini-cabeçalho interno do formulário "Nova pergunta",
 * função diferente), e Preferências tinha uma CÓPIA da mesma marcação
 * dentro de `AiPreferencesPanel` em vez de reusar este componente. Extraído
 * aqui como o ÚNICO lugar que desenha esse cabeçalho — as 5 abas agora
 * passam pelo mesmo componente, garantindo paridade pixel a pixel.
 */
function TabSectionHeader({
  icon: Icon,
  title,
  description,
  trailing,
}: TabSectionHeaderProps): JSX.Element {
  return (
    <div className="mb-3.5 flex items-start justify-between gap-2.5">
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-semibold text-foreground">{title}</h2>
          <p className="text-[12px] text-muted-foreground">{description}</p>
        </div>
      </div>
      {trailing}
    </div>
  );
}

type PanelTab = 'overview' | 'knowledge' | 'guided' | 'faq' | 'preferences';

const TABS: Array<{ id: PanelTab; label: string }> = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'knowledge', label: 'Conhecimento' },
  { id: 'guided', label: 'Assistente Guiado' },
  { id: 'faq', label: 'FAQ' },
  { id: 'preferences', label: 'Preferências' },
];

/**
 * Painel do "Cérebro da IA" (v3 — reestruturação em abas, 2026-08-25),
 * combinando Base de Conhecimento (Nível 1 + v2 "Assistente Guiado", ADR
 * #71/#85/#87), FAQ estruturada (v3, Fase 2) e Horário de atendimento
 * (F1.8, 2026-08-01) numa única casca de abas — em vez da antiga pílula de
 * 2 modos + FAQ como diálogo avulso + horário sempre visível embaixo.
 *
 * CINCO abas: "Visão geral" (resumo real do que já está configurado +
 * horário de atendimento), "Conhecimento" (texto livre, era "Texto
 * livre"), "Assistente Guiado" (quiz passo a passo), "FAQ" (entidade
 * estruturada própria, `AiFaqPanel`) e "Preferências" (v3, Fase 3,
 * 2026-08-26 — controles reais de postura/limite, `AiPreferencesPanel`).
 * "Testar IA" (mockup original tinha uma 6ª aba) fica para o futuro, fora
 * do escopo aprovado até aqui.
 *
 * `content`/horário continuam salvos JUNTOS num único `PUT` (mesmo
 * mecanismo de sempre); a FAQ é uma entidade À PARTE com seu próprio CRUD
 * (`useAiFaqEntries`), sem participar deste formulário/dirty-check — por
 * isso o botão "Salvar" só aparece nas abas Visão geral/Conhecimento.
 *
 * Regra de ADIÇÃO, nunca substituição (ADR #87): o quiz sempre ANEXA ao
 * conteúdo existente — nunca sobrescreve.
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
  const [activeTab, setActiveTab] = useState<PanelTab>('overview');
  const [justAddedFromQuiz, setJustAddedFromQuiz] = useState(false);

  // F1.8 — estado do horário de atendimento
  const [offHours, setOffHours] = useState<OffHoursForm>(profileToOffHoursForm(null));
  const [savedOffHours, setSavedOffHours] = useState<OffHoursForm>(profileToOffHoursForm(null));

  // Cérebro da IA v3, Fase 2 — só para o número real de FAQs no resumo da
  // aba "Visão geral" (a aba "FAQ" tem sua PRÓPRIA instância deste hook,
  // dentro de `AiFaqPanel` — duplicação aceita, lista pequena, sem custo real).
  const { faqEntries } = useAiFaqEntries(sessionName);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);
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

  /**
   * Onda 1 do redesign (2026-08-22) — mesma peça já existia aqui (`loadError`
   * já era separado de `saveError`, diferente de `TagsPanel`/
   * `QuickRepliesPanel`/`UserManagementPanel`/`AuditLogPanel` que precisaram
   * dessa separação nesta rodada), só reimplementava o botão "Tentar de
   * novo" à mão em vez de usar `ErrorState`. Skeleton reproduz a forma geral
   * do formulário (abas + textarea grande + rodapé de ação) para não pular
   * de tamanho quando o dado chega.
   */
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-full max-w-md rounded-md" />
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
    );
  }

  if (loadError) {
    return <ErrorState description={loadError} onRetry={() => void load()} />;
  }

  const knowledgeIsEmpty = content.trim().length === 0;
  const activeFaqCount = faqEntries.filter((entry) => entry.active).length;

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <TabList ariaLabel="Seção do Cérebro da IA" variant="underline">
          {TABS.map((tab) => (
            <TabTrigger
              key={tab.id}
              active={activeTab === tab.id}
              variant="underline"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </TabTrigger>
          ))}
        </TabList>
      </div>

      {/* Aba: Visão geral — resumo REAL do que já está configurado (nunca um
          dado inventado: sem "versão"/"assistente guiado usado", porque não
          há sinal persistido pra isso) + Horário de atendimento. */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-5 xl:flex-row">
          <div className="min-w-0 flex-1 space-y-3.5">
            <div>
              <TabSectionHeader
                icon={LayoutDashboard}
                title="Visão geral"
                description="Resumo do que já está configurado no Cérebro da IA e o horário de atendimento."
                trailing={
                  updatedAt ? (
                    <span className="shrink-0 text-[11.5px] text-muted-foreground">
                      Atualizado em {new Date(updatedAt).toLocaleString('pt-BR')}
                    </span>
                  ) : undefined
                }
              />
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
              >
                <OverviewStatCard
                  icon={BookOpen}
                  label="Base de conhecimento"
                  value={knowledgeIsEmpty ? 'Vazia' : 'Preenchida'}
                  tone={knowledgeIsEmpty ? 'warning' : 'success'}
                />
                <OverviewStatCard
                  icon={AlignLeft}
                  label="Caracteres usados"
                  value={`${content.length.toLocaleString('pt-BR')} / ${MAX_CONTENT_LENGTH.toLocaleString('pt-BR')}`}
                  tone="primary"
                />
                <OverviewStatCard
                  icon={HelpCircle}
                  label="FAQ ativas"
                  value={String(activeFaqCount)}
                  numericValue={activeFaqCount}
                  tone="primary"
                />
                <OverviewStatCard
                  icon={Clock}
                  label="Horário de atendimento"
                  value={offHours.enabled ? 'Ativo' : 'Desativado'}
                  tone={offHours.enabled ? 'success' : 'muted'}
                />
              </motion.div>
            </div>

            {/* ── Horário de atendimento (F1.8) ─────────────────────────────── */}
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
                        className="rounded-[7px] border border-border bg-card px-[7px] py-1 text-[12.5px] text-foreground [color-scheme:light] dark:[color-scheme:dark]"
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
                        className="rounded-[7px] border border-border bg-card px-[7px] py-1 text-[12.5px] text-foreground [color-scheme:light] dark:[color-scheme:dark]"
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
                      O horário de fim é anterior ou igual ao de início — o aviso será enviado
                      sempre.
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
                    Deixe em branco para usar a mensagem padrão. A IA ainda vai responder — este
                    aviso é incluído no contexto, não no lugar da resposta.
                  </p>
                </div>
              )}
            </div>
            {/* ── Fim da seção de horário ──────────────────────────────────── */}
          </div>

          {/* Coluna de dicas — usa o espaço extra da página mais larga (1040px,
            era 780px) com conteúdo real em vez de vazio; texto vem do
            mockup original ("Dicas para melhores respostas"). */}
          <aside className="w-full shrink-0 xl:w-[260px]">
            <div className="rounded-lg border border-border bg-card p-[18px]">
              <h2 className="mb-3 text-[13px] font-semibold text-foreground">
                Dicas para melhores respostas
              </h2>
              <ul className="space-y-2.5 text-[12.5px] leading-[1.5] text-muted-foreground">
                <li className="flex gap-2">
                  <span
                    className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  Seja claro e objetivo nas instruções.
                </li>
                <li className="flex gap-2">
                  <span
                    className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  Inclua informações sobre seus serviços.
                </li>
                <li className="flex gap-2">
                  <span
                    className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  Adicione respostas para objeções comuns na aba FAQ.
                </li>
                <li className="flex gap-2">
                  <span
                    className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  Mantenha o tom de conversa natural.
                </li>
                <li className="flex gap-2">
                  <span
                    className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  Revise e teste suas configurações.
                </li>
              </ul>
            </div>
          </aside>
        </div>
      )}

      {/* Aba: Conhecimento (era "Texto livre") */}
      {activeTab === 'knowledge' && (
        <div className="rounded-lg border border-border bg-card p-[18px]">
          <TabSectionHeader
            icon={BookOpen}
            title="Conhecimento da empresa"
            description="Texto livre que a IA usa como base pra responder — nome, produtos, preços, horário."
          />

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
            rows={18}
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

      {/* Aba: Assistente Guiado */}
      {activeTab === 'guided' && (
        <div>
          <TabSectionHeader
            icon={MessagesSquare}
            title="Assistente Guiado"
            description="Responda 8 perguntas rápidas e a IA monta o texto do Conhecimento pra você."
          />
          <AiProfileQuizWizard
            onGenerate={(text) => {
              setContent((current) => appendToProfileContent(current, text));
              setJustAddedFromQuiz(true);
              setSavedNotice(false);
              setActiveTab('knowledge');
            }}
          />
        </div>
      )}

      {/* Aba: FAQ (Cérebro da IA v3, Fase 2) — entidade própria, CRUD
          independente do resto deste formulário (sem dirty-check aqui).
          Cabeçalho padronizado (2026-08-26) fica AQUI, a nível de aba — o
          mini-cabeçalho "Nova pergunta" dentro de `AiFaqPanel` continua
          existindo, mas é do FORMULÁRIO de criar, não da aba em si. */}
      {activeTab === 'faq' && (
        <div>
          <TabSectionHeader
            icon={HelpCircle}
            title="FAQ"
            description="Perguntas e respostas pré-aprovadas que a IA usa quando baterem com o que o cliente perguntar."
          />
          <AiFaqPanel sessionName={sessionName} />
        </div>
      )}

      {/* Aba: Preferências (Cérebro da IA v3, Fase 3, 2026-08-26) — entidade
          própria (`AiPreferences`, GET/PUT), mesmo racional de FAQ acima:
          próprio ciclo de carregar/salvar. Cabeçalho padronizado fica AQUI
          (não mais duplicado dentro de `AiPreferencesPanel`). Bug real
          medido nesta rodada: um `<form>` interno em `AiPreferencesPanel`
          ficaria ANINHADO dentro do `<form>` desta página (HTML inválido) —
          clicar "Salvar" disparava uma navegação de página inteira em vez
          do submit esperado. `AiPreferencesPanel` usa `<div>` + botão comum
          (`onClick`), nunca `<form>`. */}
      {activeTab === 'preferences' && (
        <div>
          <TabSectionHeader
            icon={SlidersHorizontal}
            title="Preferências"
            description="Controles reais de postura e limites — cada um muda de fato como a IA se comporta."
          />
          <AiPreferencesPanel sessionName={sessionName} />
        </div>
      )}

      {/* Feedback + botão de salvar "de reserva" — só nas abas Visão
          geral/Conhecimento; a aba Conhecimento já tem seu próprio Salvar
          embutido no card acima, então o de reserva só precisa aparecer em
          Visão geral (é o único jeito de salvar uma mudança de Horário de
          atendimento sem trocar de aba). Guiado/FAQ/Preferências nunca
          mostram Salvar aqui: um só gera texto (revisado em Conhecimento),
          os outros dois salvam por conta própria. */}
      {saveError && (
        <p className="mt-3 text-sm text-destructive" role="alert" aria-live="polite">
          {saveError}
        </p>
      )}
      {savedNotice && !dirty && (
        <p className="mt-3 text-sm text-success" role="status" aria-live="polite">
          Salvo! A IA já vai usar essas informações nas próximas respostas.
        </p>
      )}
      {activeTab === 'overview' && (
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
