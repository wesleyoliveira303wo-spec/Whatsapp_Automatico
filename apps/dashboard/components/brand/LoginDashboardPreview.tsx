import { ChevronDown, TrendingUp, Sparkles, UserCheck, Phone } from 'lucide-react';

/**
 * Reconstrução das telas de Login/Registro (2026-08-28, pedido explícito do
 * fundador, imagem de referência anexada) — mockup do PRODUTO para a
 * lateral de marca (`AuthMarketingPanel`, compartilhado pelas duas telas).
 * Puramente decorativo (`aria-hidden`) — os números são AMOSTRA, nunca dado
 * real (não há sessão nem tenant nesta tela, pré-login): a proposta de
 * valor já está no headline/benefícios ao lado, isto só reforça
 * visualmente. Substitui `LoginChatPreview` (removido nesta rodada, ficou
 * órfão — as duas telas de auth passaram a usar só este mockup).
 *
 * Vetor/HTML nativo (não captura de tela real) pelo mesmo motivo de sempre
 * neste projeto: nítido em qualquer densidade, sem peso de imagem, temável
 * pelos tokens do Design System — nunca hardcoded, para acompanhar o tema
 * escuro forçado desta página sem duplicar cor nenhuma.
 */
export default function LoginDashboardPreview(): JSX.Element {
  return (
    <div aria-hidden="true" className="relative w-full max-w-[380px]">
      {/* selo decorativo — "conversa via WhatsApp", nunca o logotipo da Meta
          (marca de terceiro). 6ª rodada (2026-08-28, achado real do
          fundador: o selo sobrepunha "Novo lead" na coluna de conversas) —
          antes ele afundava ~44px pra dentro do card (`-top-8 right-8`,
          quase todo sobre a coluna); agora pende mais pra FORA do canto
          (`-right-3`, ultrapassando a borda direita) e mais alto
          (`-top-11`), sobrando bem menos área por cima do texto. */}
      <div
        className="absolute -top-11 -right-3 z-10 grid h-[72px] w-[72px] -rotate-6 place-items-center rounded-[20px]"
        style={{
          background: 'radial-gradient(circle at 35% 30%, hsl(var(--success)), hsl(var(--primary)) 70%)',
          boxShadow: '0 0 44px 4px hsl(var(--success) / 0.5)',
        }}
      >
        <Phone className="h-8 w-8 fill-white text-white" strokeWidth={0} aria-hidden="true" />
      </div>

      <div className="relative -rotate-3 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex">
          {/* rail decorativo */}
          <div className="flex w-10 shrink-0 flex-col items-center gap-3.5 border-r border-border bg-background py-3.5">
            <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-primary/20 text-[9px] font-bold text-primary">
              F
            </span>
            <span className="h-3.5 w-3.5 rounded-[4px] bg-muted" />
            <span className="h-3.5 w-3.5 rounded-[4px] bg-muted" />
            <span className="h-3.5 w-3.5 rounded-[4px] bg-muted" />
          </div>

          <div className="min-w-0 flex-1 px-3.5 py-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-foreground">Dashboard</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {[
                { label: 'Conversas ativas', value: '128', delta: '+23%' },
                { label: 'Taxa de conversão', value: '38,6%', delta: '+12%' },
                { label: 'Mensagens enviadas', value: '2.549', delta: '+18%' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-center justify-between rounded-[10px] border border-border bg-background px-2.5 py-2"
                >
                  <div>
                    <p className="text-[9px] text-muted-foreground">{stat.label}</p>
                    <p className="mt-0.5 text-[15px] font-bold leading-none text-foreground">
                      {stat.value}
                    </p>
                  </div>
                  <span className="text-[9.5px] font-bold text-success">{stat.delta}</span>
                </div>
              ))}
            </div>

            <svg
              className="mt-3 h-9 w-full"
              viewBox="0 0 300 60"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M0 42 Q 30 8, 60 30 T 120 26 T 180 44 T 240 14 T 300 24"
                fill="none"
                stroke="hsl(var(--success))"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="300" cy="24" r="4" fill="hsl(var(--success))" />
            </svg>
          </div>

          {/* coluna conversas — `pt-5` (maior que o `pb-3.5` do resto, 6ª
              rodada) empurra "Conversas"/"Novo lead" pra baixo da área que o
              selo do WhatsApp ocupa por cima, mesmo com ele reposicionado. */}
          <div className="w-[128px] shrink-0 border-l border-border px-2.5 pb-3.5 pt-5">
            <p className="mb-2.5 text-[11px] font-bold text-foreground">Conversas</p>
            <div className="flex flex-col gap-2">
              {['Novo lead', 'Ana Clara', 'João Pedro', 'Mariana Costa', 'Lucas Lima'].map(
                (contactName, index) => (
                  <div key={contactName} className="flex items-center gap-1.5">
                    <span
                      className="h-5 w-5 shrink-0 rounded-full"
                      style={{ background: `hsl(${142 + index * 34} 30% 32%)` }}
                    />
                    <p className="min-w-0 truncate text-[9.5px] font-semibold text-foreground">
                      {contactName}
                    </p>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-border px-3.5 py-3">
          <p className="mb-2 text-[10.5px] font-bold text-foreground">Mensagens automáticas</p>
          <div className="flex flex-col gap-1.5">
            {[
              { icon: Sparkles, label: 'Boas-vindas' },
              { icon: UserCheck, label: 'Qualificação' },
              { icon: TrendingUp, label: 'Follow-up' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <Icon className="h-3 w-3 text-success" aria-hidden="true" />
                <span className="text-[9.5px] text-foreground-secondary">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
