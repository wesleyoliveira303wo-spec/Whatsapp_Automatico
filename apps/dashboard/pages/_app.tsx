import '../styles/globals.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { Instrument_Sans } from 'next/font/google';
import { MotionConfig } from 'framer-motion';
import { BRAND, pageTitle } from '@/lib/brand';
import { Toaster } from '@/components/ui/toaster';

/**
 * Reskin 2026-08-06 — Design System §3 (processo externo "Claude Design")
 * especifica Instrument Sans em toda a interface, no lugar da Inter (Bloco
 * M6A-4/ADR #61). Mesmo mecanismo de antes: `next/font/google` (ZERO
 * dependência nova, self-hosted em build time), `variable` expõe
 * `--font-sans` (renomeado de `--font-inter` — só usado dentro do próprio
 * `tailwind.config.js`, nenhum outro arquivo referenciava o nome antigo)
 * como CSS custom property consumida por `fontFamily.sans`. `display:
 * 'swap'` evita texto invisível durante o carregamento (FOIT).
 */
const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export default function MyApp({ Component, pageProps }: AppProps): JSX.Element {
  return (
    <div className={`${instrumentSans.variable} font-sans`}>
      {/*
        Milestone 6, Bloco M6B-2 — título e descrição PADRÃO da marca (via
        lib/brand.ts, nunca hardcoded). Cada página pode sobrescrever o
        <title> com o seu próprio <Head> (Next mescla e a última tag vence),
        no padrão "Página · Francis" do helper pageTitle.
      */}
      <Head>
        <title>{pageTitle()}</title>
        <meta name="description" content={BRAND.description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      {/*
        Onda 2 do redesign (2026-08-23) — `framer-motion` estava instalado
        desde a M6A (ADR #62: "só para microinteração, nunca transição de
        página") mas nunca tinha um único import no produto até esta rodada.
        `MotionConfig reducedMotion="user"` é o interruptor GLOBAL de
        acessibilidade: respeita `prefers-reduced-motion` do sistema
        operacional automaticamente para TODO componente `motion.*` do app,
        sem precisar checar a preferência em cada animação individualmente
        (ver também a regra equivalente em CSS puro, `globals.css`, para as
        transições que não passam por framer-motion).
      */}
      <MotionConfig reducedMotion="user">
        <Component {...pageProps} />
      </MotionConfig>
      {/*
        Milestone 6, Bloco M6C-3 — fila global de toasts (Radix Toast).
        Montado uma vez aqui; qualquer `toast(...)` (de `components/ui/use-toast`)
        de qualquer componente aparece através deste.
      */}
      <Toaster />
    </div>
  );
}
