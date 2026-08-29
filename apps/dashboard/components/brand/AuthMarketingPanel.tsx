import { Zap, TrendingUp, Users } from 'lucide-react';
import FrancisLogo from '@/components/brand/FrancisLogo';
import LoginDashboardPreview from '@/components/brand/LoginDashboardPreview';
import { BRAND } from '@/lib/brand';

export const AUTH_BADGE = 'WhatsApp Automation + CRM';

const HEADLINE_LEAD = 'Automatize conversas.';
const HEADLINE_BODY = 'Converta mais. ';
const HEADLINE_ACCENT = 'Venda todos os dias.';

const SUBCOPY =
  'O Francis atende, qualifica e acompanha seus leads no WhatsApp enquanto você foca no que realmente importa: crescer.';

const FEATURES = [
  {
    icon: Zap,
    title: 'Atendimento 24h por IA',
    description: 'Responde, qualifica e encaminha seus leads automaticamente.',
  },
  {
    icon: TrendingUp,
    title: 'Mais conversões',
    description: 'Transforme conversas em vendas com follow-ups inteligentes.',
  },
  {
    icon: Users,
    title: 'Tudo em um só lugar',
    description: 'CRM, automações e relatórios para você gerenciar e escalar seu negócio.',
  },
];

/**
 * Painel de marca das telas de AUTENTICAÇÃO (login E registro) — extraído
 * (2026-08-28, pedido do fundador: "a aba de registro ainda é a antiga, use
 * a mesma regra nela") de `pages/login.tsx` para as duas páginas nunca
 * divergirem visualmente por terem cada uma sua própria cópia deste bloco.
 * `pages/login.tsx`/`pages/register.tsx` só decidem o `dark` no wrapper +
 * o formulário à direita; a marca (logo, badge, headline, benefícios,
 * mockup do dashboard) é sempre a mesma nas duas — mesmo racional de
 * "a mesma marca recebe quem chega, entrando ou se cadastrando".
 */
export default function AuthMarketingPanel(): JSX.Element {
  return (
    <aside className="relative hidden border-border px-14 py-10 lg:flex lg:w-[53%] lg:flex-col lg:border-r xl:px-16">
      {/*
        6ª rodada (2026-08-28, achado real do fundador) — `overflow-x-hidden`
        direto no `<aside>` parecia inofensivo (só pra conter o glow que
        sangra pela esquerda), mas por regra do próprio CSS (quando só um
        eixo do overflow é diferente de `visible`, o navegador força o OUTRO
        eixo a virar `auto`) isso recriava, escondida, a MESMA barra de
        rolagem no meio da tela da 4ª rodada — e pior, prendia o mockup
        dentro do scroll interno do `<aside>`, fora do alcance do scroll da
        PÁGINA (exatamente "totalmente cortado" outra vez). Corrigido isolando
        o clip só no glow: ele mora num wrapper próprio `absolute inset-0
        overflow-hidden` (clipa nos dois eixos, sem o efeito colateral do
        CSS) — o `<aside>` em si não declara overflow nenhum.
      */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* glow ambiente, canto inferior esquerdo — sutil, nunca dominante */}
        <div
          className="absolute -bottom-36 -left-36 h-[420px] w-[420px] rounded-full opacity-60"
          style={{
            background:
              'radial-gradient(circle, hsl(var(--success) / 0.5) 0%, hsl(var(--success) / 0.15) 45%, transparent 72%)',
          }}
        />
      </div>

      <div className="relative z-10 flex items-center gap-3">
        <FrancisLogo size={44} />
        <span className="text-2xl font-extrabold tracking-tight text-foreground">
          {BRAND.name}
        </span>
      </div>

      <span className="relative z-10 mt-9 inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/[0.08] px-4 py-[7px] text-[12.5px] font-semibold text-success">
        {AUTH_BADGE}
      </span>

      <h1 className="relative z-10 mt-5 max-w-[640px] text-[32px] font-bold leading-[1.18] tracking-tight text-foreground text-pretty xl:text-[35px]">
        {HEADLINE_LEAD}
        <br />
        {HEADLINE_BODY}
        <span className="text-success">{HEADLINE_ACCENT}</span>
      </h1>

      <p className="relative z-10 mt-4 max-w-[480px] text-[15px] leading-relaxed text-muted-foreground">
        {SUBCOPY}
      </p>

      <ul className="relative z-10 mt-7 flex max-w-[420px] flex-col gap-5">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <li key={title} className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/[0.12]">
              <Icon className="h-5 w-5 text-success" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-foreground">{title}</p>
              <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {/*
        4ª rodada (2026-08-28, achado real do fundador: com `flex-1
        items-end` o mockup era empurrado até o FUNDO de todo o espaço
        sobrando no painel — em telas mais baixas isso o jogava pra fora da
        caixa do `aside`, e o `overflow-hidden` (que existia só pra conter o
        glow decorativo) CORTAVA o mockup por cima, exatamente o "aparece
        cortado e muito abaixo" reportado. Trocado por fluxo normal (uma
        margem fixa, sem `flex-1`/`items-end`): o mockup fica logo abaixo
        dos benefícios, na altura que o conteúdo pede — nunca mais forçado
        pro fundo de um espaço que pode não existir. `aside` também não usa
        mais `overflow-hidden` completo (só `overflow-x-hidden`, pro glow
        que sangra pela esquerda) — o que sangrar por baixo do glow se
        mistura ao fundo escuro do rodapé, imperceptível.
      */}
      <div className="relative z-10 mt-8 flex justify-end">
        <LoginDashboardPreview />
      </div>
    </aside>
  );
}
