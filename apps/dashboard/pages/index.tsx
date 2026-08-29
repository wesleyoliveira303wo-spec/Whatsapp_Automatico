import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { requirePageSession } from '@/lib/auth';
import { APP_HOME } from '@/lib/routes';
import { BRAND, pageTitle } from '@/lib/brand';
import { HERO, TRUST_CHIPS } from '@/lib/landingContent';
import LandingNav from '@/components/landing/LandingNav';
import LandingHero from '@/components/landing/LandingHero';
import LandingFooter from '@/components/landing/LandingFooter';
import {
  Beneficios,
  ComoFunciona,
  Confianca,
  CtaFinal,
  Diferencial,
  Faq,
  IaSection,
  Planos,
  Problema,
  Recursos,
  Solucao,
  TrustStrip,
} from '@/components/landing/LandingSections';

/**
 * `/` — LANDING PAGE pública (2026-08-29). Antes desta data, `/` era o
 * Workspace (agora em `/app`, ver `lib/routes.ts`).
 *
 * `getServerSideProps` só faz o desvio de quem já está logado — nenhuma
 * chamada à API, nenhum dado dinâmico: a página é estática na prática.
 * Visitante anônimo vê a landing; visitante logado vai para o app (ou para
 * a troca de senha obrigatória, se for o caso).
 *
 * Tema: a landing é ESCURA por decisão de design (mesma casca das telas de
 * `/login` e `/register` — a jornada landing → cadastro é um produto só).
 * `className="dark"` no wrapper raiz escopa os tokens de `.dark`
 * (`globals.css`) só aqui, sem tocar `localStorage`/a preferência do resto
 * do app — mesmo mecanismo já usado em `pages/login.tsx`.
 */
interface LandingPageProps {
  currentYear: number;
}

export const getServerSideProps: GetServerSideProps<LandingPageProps> = async (context) => {
  const session = requirePageSession(context);
  if (session) {
    const destination = session.user?.mustChangePassword ? '/change-password' : APP_HOME;
    return { redirect: { destination, permanent: false } };
  }
  return { props: { currentYear: new Date().getFullYear() } };
};

const TITLE = `${BRAND.name} — Atendimento no WhatsApp com IA que atende, organiza e escala`;

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: BRAND.name,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description: BRAND.description,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'BRL',
    description: 'Plano Grátis — 1 número de WhatsApp, IA treinável, pipeline e analytics.',
  },
};

export default function LandingPage({ currentYear }: LandingPageProps): JSX.Element {
  return (
    <div className="dark min-h-screen bg-background text-foreground antialiased [color-scheme:dark]">
      <Head>
        <title>{pageTitle(TITLE)}</title>
        <meta name="description" content={HERO.subtitle} />
        <meta name="robots" content="index,follow" />
        <meta name="theme-color" content="#070c18" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={BRAND.name} />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={HERO.subtitle} />
        <meta property="og:image" content="/logo-francis.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={HERO.subtitle} />
      </Head>

      {/*
        JSON-LD fora do <Head> de propósito: o next/head não é o lugar
        recomendado para <script>. Como DOM normal, o Next renderiza sem
        avisos. Conteúdo 100% estático (sem entrada de usuário).
      */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
      >
        Pular para o conteúdo
      </a>
      <LandingNav />
      <main id="conteudo">
        <LandingHero />
        <TrustStrip chips={TRUST_CHIPS} />
        <Problema />
        <Solucao />
        <Recursos />
        <IaSection />
        <ComoFunciona />
        <Beneficios />
        <Diferencial />
        <Confianca />
        <Planos />
        <Faq />
        <CtaFinal />
      </main>
      <LandingFooter year={currentYear} />
    </div>
  );
}
