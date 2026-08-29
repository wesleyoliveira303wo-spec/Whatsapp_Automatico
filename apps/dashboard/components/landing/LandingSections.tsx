import type { ComponentType } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Brain,
  Check,
  Handshake,
  KanbanSquare,
  Megaphone,
  Minus,
  Plus,
  Tags,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Reveal from './Reveal';
import { PipelineMockup, AiInteractionsMockup } from './LandingMockups';
import {
  BENEFICIOS,
  COMO_FUNCIONA,
  CONFIANCA,
  CTA_FINAL,
  DIFERENCIAL,
  FAQ,
  IA_SECTION,
  PLANOS,
  PROBLEMA,
  RECURSOS,
  SOLUCAO,
} from '@/lib/landingContent';

/* ---------- helpers ---------- */

function Eyebrow({ children }: { children: string }): JSX.Element {
  return (
    <span className="font-mono text-xs uppercase tracking-[0.14em] text-primary">{children}</span>
  );
}

function IconBadge({ Icon }: { Icon: ComponentType<{ className?: string }> }): JSX.Element {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-primary/20 bg-primary/10 text-primary">
      <Icon className="h-5 w-5" />
    </span>
  );
}

const RECURSO_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  brain: Brain,
  handshake: Handshake,
  kanban: KanbanSquare,
  megaphone: Megaphone,
  chart: BarChart3,
  tags: Tags,
};

/* ---------- sections ---------- */

export function TrustStrip({ chips }: { chips: readonly string[] }): JSX.Element {
  return (
    <div className="border-y border-border/70 bg-card/50">
      <ul className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-8 gap-y-3 px-5 py-6 sm:px-8">
        {chips.map((chip) => (
          <li key={chip} className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-primary" />
            {chip}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Problema(): JSX.Element {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
      <Reveal>
        <Eyebrow>{PROBLEMA.eyebrow}</Eyebrow>
        <h2 className="mt-3 max-w-xl text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-tight tracking-tight">
          {PROBLEMA.title}
        </h2>
      </Reveal>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {PROBLEMA.cards.map((card, i) => (
          <Reveal key={card} delay={i * 0.05}>
            <div className="h-full rounded-xl border border-border bg-card p-6 text-[15px]">{card}</div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function Solucao(): JSX.Element {
  return (
    <section className="border-y border-border/70 bg-card/50">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
        <Reveal>
          <Eyebrow>{SOLUCAO.eyebrow}</Eyebrow>
          <h2 className="mt-3 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-tight tracking-tight">
            {SOLUCAO.title}
          </h2>
          <div className="mt-8 flex flex-col gap-6">
            {SOLUCAO.points.map((p) => (
              <div key={p.title} className="flex gap-4">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div>
                  <p className="font-semibold">{p.title}</p>
                  <p className="mt-1 text-[15px] text-muted-foreground">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <PipelineMockup />
        </Reveal>
      </div>
    </section>
  );
}

export function Recursos(): JSX.Element {
  return (
    <section id="recursos" className="scroll-mt-24 mx-auto max-w-6xl px-5 py-24 sm:px-8">
      <Reveal>
        <Eyebrow>{RECURSOS.eyebrow}</Eyebrow>
        <h2 className="mt-3 max-w-2xl text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-tight tracking-tight">
          {RECURSOS.title}
        </h2>
      </Reveal>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RECURSOS.cards.map((card, i) => (
          <Reveal key={card.title} delay={(i % 3) * 0.05}>
            <div className="h-full rounded-xl border border-border bg-card p-6">
              <IconBadge Icon={RECURSO_ICONS[card.icon]} />
              <h3 className="mt-4 text-base font-semibold">{card.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{card.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function IaSection(): JSX.Element {
  return (
    <section id="ia" className="scroll-mt-24 relative overflow-hidden border-y border-border/70 bg-card/50">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-120px] top-16 h-[380px] w-[560px] rounded-full bg-primary/15 blur-[120px]"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
        <Reveal>
          <Eyebrow>{IA_SECTION.eyebrow}</Eyebrow>
          <h2 className="mt-3 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-tight tracking-tight">
            {IA_SECTION.title}
          </h2>
          <ul className="mt-8 flex flex-col gap-4">
            {IA_SECTION.bullets.map((b) => (
              <li key={b.strong} className="flex gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span className="text-[15px] text-muted-foreground">
                  <strong className="font-semibold text-foreground">{b.strong}</strong>
                  {b.rest}
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.1}>
          <AiInteractionsMockup />
        </Reveal>
      </div>
    </section>
  );
}

export function ComoFunciona(): JSX.Element {
  return (
    <section id="como-funciona" className="scroll-mt-24 mx-auto max-w-6xl px-5 py-24 sm:px-8">
      <Reveal>
        <Eyebrow>{COMO_FUNCIONA.eyebrow}</Eyebrow>
        <h2 className="mt-3 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-tight tracking-tight">
          {COMO_FUNCIONA.title}
        </h2>
      </Reveal>
      <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {COMO_FUNCIONA.steps.map((s, i) => (
          <Reveal key={s.n} delay={i * 0.05} as="li">
            <div className="h-full rounded-xl border border-border bg-card p-6">
              <span className="font-mono text-[13px] text-primary">{s.n}</span>
              <h3 className="mt-3 text-[15px] font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
            </div>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

export function Beneficios(): JSX.Element {
  return (
    <section className="border-y border-border/70 bg-card/50">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <Reveal>
          <Eyebrow>{BENEFICIOS.eyebrow}</Eyebrow>
          <h2 className="mt-3 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-tight tracking-tight">
            {BENEFICIOS.title}
          </h2>
        </Reveal>
        <div className="mt-9 flex flex-col gap-3">
          {BENEFICIOS.rows.map((row, i) => (
            <Reveal key={row.feature} delay={i * 0.04}>
              <div className="grid gap-4 rounded-xl border border-border bg-background p-5 sm:grid-cols-3 sm:items-center sm:px-6">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    Recurso
                  </p>
                  <p className="mt-1 text-[15px] font-semibold">{row.feature}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    Benefício
                  </p>
                  <p className="mt-1 text-[15px] text-muted-foreground">{row.benefit}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-primary">
                    Resultado
                  </p>
                  <p className="mt-1 text-[15px]">{row.result}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Diferencial(): JSX.Element {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
      <Reveal>
        <Eyebrow>{DIFERENCIAL.eyebrow}</Eyebrow>
        <h2 className="mt-3 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-tight tracking-tight">
          {DIFERENCIAL.title}
        </h2>
      </Reveal>
      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <Reveal>
          <div className="h-full rounded-xl border border-border bg-card p-6">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sem Francis
            </p>
            <ul className="mt-4 flex flex-col gap-3">
              {DIFERENCIAL.sem.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm text-muted-foreground">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="h-full rounded-xl border border-primary/30 bg-primary/[0.06] p-6">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-primary">
              Com Francis
            </p>
            <ul className="mt-4 flex flex-col gap-3">
              {DIFERENCIAL.com.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
      <Reveal>
        <p className="mt-6 max-w-2xl text-[15px] text-muted-foreground">{DIFERENCIAL.note}</p>
      </Reveal>
    </section>
  );
}

export function Confianca(): JSX.Element {
  return (
    <section className="border-y border-border/70 bg-card/50">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <Reveal>
          <Eyebrow>{CONFIANCA.eyebrow}</Eyebrow>
          <h2 className="mt-3 max-w-xl text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-tight tracking-tight">
            {CONFIANCA.title}
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CONFIANCA.signals.map((s, i) => (
            <Reveal key={s.title} delay={(i % 3) * 0.05}>
              <div className="h-full rounded-xl border border-border bg-background p-6">
                <Check className="h-5 w-5 text-primary" />
                <h3 className="mt-3 text-[15px] font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
              </div>
            </Reveal>
          ))}
          <Reveal delay={0.1}>
            <figure className="h-full rounded-xl border border-primary/25 bg-primary/[0.06] p-6">
              <blockquote className="text-sm italic">“{CONFIANCA.founderQuote}”</blockquote>
              <figcaption className="mt-3 text-[13px] text-muted-foreground">
                — {CONFIANCA.founderName}
              </figcaption>
            </figure>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function PlanFeatureList({ features }: { features: readonly string[] }): JSX.Element {
  return (
    <ul className="mt-5 flex flex-col gap-2.5 text-sm text-muted-foreground">
      {features.map((f) => (
        <li key={f} className="flex gap-2.5">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          {f}
        </li>
      ))}
    </ul>
  );
}

export function Planos(): JSX.Element {
  return (
    <section id="planos" className="scroll-mt-24 mx-auto max-w-6xl px-5 py-24 sm:px-8">
      <Reveal>
        <Eyebrow>{PLANOS.eyebrow}</Eyebrow>
        <h2 className="mt-3 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-tight tracking-tight">
          {PLANOS.title}
        </h2>
      </Reveal>
      <div className="mt-10 grid max-w-3xl gap-5 sm:grid-cols-2">
        <Reveal>
          <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-7">
            <p className="text-sm font-semibold">{PLANOS.free.name}</p>
            <p className="mt-2.5 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tracking-tight">{PLANOS.free.price}</span>
              <span className="text-[13px] text-muted-foreground">{PLANOS.free.period}</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{PLANOS.free.tagline}</p>
            <Button asChild className="mt-5 w-full">
              <Link href="/register">{PLANOS.free.cta}</Link>
            </Button>
            <PlanFeatureList features={PLANOS.free.features} />
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="relative flex h-full flex-col rounded-2xl border border-primary/30 bg-primary/[0.05] p-7">
            <span className="absolute right-4 top-4 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">
              {PLANOS.pro.badge}
            </span>
            <p className="text-sm font-semibold">{PLANOS.pro.name}</p>
            <p className="mt-2.5 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tracking-tight">{PLANOS.pro.price}</span>
              <span className="text-[13px] text-muted-foreground">{PLANOS.pro.period}</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{PLANOS.pro.tagline}</p>
            <Button asChild variant="outline" className="mt-5 w-full">
              <Link href="/register">{PLANOS.pro.cta}</Link>
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">{PLANOS.pro.ctaNote}</p>
            <PlanFeatureList features={PLANOS.pro.features} />
          </div>
        </Reveal>
      </div>
      <Reveal>
        <p className="mt-5 text-[13px] text-muted-foreground/80">{PLANOS.footnote}</p>
      </Reveal>
    </section>
  );
}

export function Faq(): JSX.Element {
  return (
    <section id="perguntas" className="scroll-mt-24 border-y border-border/70 bg-card/50">
      <div className="mx-auto max-w-2xl px-5 py-24 sm:px-8">
        <Reveal>
          <Eyebrow>{FAQ.eyebrow}</Eyebrow>
          <h2 className="mt-3 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-tight tracking-tight">
            {FAQ.title}
          </h2>
        </Reveal>
        <div className="mt-9 flex flex-col gap-3">
          {FAQ.items.map((item) => (
            <details
              key={item.q}
              className="group rounded-xl border border-border bg-background px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                {item.q}
                <Plus className="h-4 w-4 shrink-0 text-primary group-open:hidden" aria-hidden="true" />
                <Minus className="hidden h-4 w-4 shrink-0 text-primary group-open:block" aria-hidden="true" />
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CtaFinal(): JSX.Element {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-200px] left-1/2 h-[440px] w-[min(90vw,880px)] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]"
      />
      <div className="relative mx-auto max-w-3xl px-5 py-28 text-center sm:px-8">
        <Reveal>
          <h2 className="text-[clamp(1.9rem,5vw,2.75rem)] font-semibold leading-tight tracking-tight text-balance">
            {CTA_FINAL.title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">{CTA_FINAL.subtitle}</p>
          <div className="mt-7 flex justify-center">
            <Button asChild size="lg" className="gap-2">
              <Link href="/register">
                Criar conta grátis
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <p className="mt-4 text-[13px] text-muted-foreground/80">{CTA_FINAL.microline}</p>
        </Reveal>
      </div>
    </section>
  );
}
