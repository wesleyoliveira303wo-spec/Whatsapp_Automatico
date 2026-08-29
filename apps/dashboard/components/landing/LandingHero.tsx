import Link from 'next/link';
import { ArrowRight, Sparkles, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HERO } from '@/lib/landingContent';
import Reveal from './Reveal';

/**
 * Landing page (2026-08-29) — Hero. Promessa específica + subtítulo (o que é,
 * pra quem, qual transformação) + CTA primário para `/register` e secundário
 * para a âncora "Como funciona". À direita, um mock fiel de conversa no
 * WhatsApp: resposta gerada pela IA + o momento em que a conversa é
 * escalada para um humano — comportamento real do produto (handoff).
 */
function ChatMockup(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
    >
      <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-muted to-background text-xs font-semibold text-muted-foreground">
          TO
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Trigo de Ouro — Padaria</p>
          <p className="flex items-center gap-1.5 text-xs text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Francis respondendo
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 bg-background px-4 py-5">
        <div className="max-w-[80%] self-start rounded-[4px_14px_14px_14px] border border-border bg-muted/50 px-3 py-2 text-sm">
          Vocês entregam bolo pra amanhã?
          <span className="mt-1 block text-[11px] text-muted-foreground">09:12</span>
        </div>
        <div className="max-w-[85%] self-end rounded-[14px_4px_14px_14px] border border-primary/30 bg-primary/15 px-3 py-2 text-sm">
          Entregamos sim! Pra amanhã eu confirmo com 1 dia de antecedência. Qual sabor você prefere?
          <span className="mt-1.5 flex items-center gap-1 text-[11px] text-primary">
            <Sparkles className="h-3 w-3" />
            Gerada pelo Francis · 09:12
          </span>
        </div>
        <div className="max-w-[80%] self-start rounded-[4px_14px_14px_14px] border border-border bg-muted/50 px-3 py-2 text-sm">
          Prefiro de chocolate. Pode me passar com uma pessoa?
          <span className="mt-1 block text-[11px] text-muted-foreground">09:13</span>
        </div>
        <div className="flex items-center gap-2 self-center rounded-full border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning-emphasis">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          Cliente pediu atendente — conversa enviada pra você
        </div>
      </div>
    </div>
  );
}

export default function LandingHero(): JSX.Element {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-160px] h-[420px] w-[min(90vw,900px)] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {HERO.eyebrow}
          </span>
          <h1 className="mt-5 text-[clamp(2rem,6vw,3.25rem)] font-semibold leading-[1.08] tracking-tight text-balance">
            {HERO.titleTop}
            <br className="hidden sm:block" />{' '}
            <span className="text-primary">{HERO.titleAccent}</span>
            {HERO.titleRest}
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">{HERO.subtitle}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="gap-2">
              <Link href="/register">
                Criar conta grátis
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#como-funciona">Ver como funciona</a>
            </Button>
          </div>
          <p className="mt-4 text-[13px] text-muted-foreground/80">{HERO.microline}</p>
        </Reveal>

        <Reveal delay={0.12} className="flex justify-center lg:justify-end">
          <ChatMockup />
        </Reveal>
      </div>
    </section>
  );
}
